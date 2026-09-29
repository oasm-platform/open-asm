package worker

import (
	"context"
	"fmt"
	"oasm-worker/internal/config"
	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	"oasm-worker/internal/runtime"
	"oasm-worker/internal/sysresources"
	"oasm-worker/internal/telemetry"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"oasm-worker/internal/gen/workers"

	"oasm-worker/internal/grpcclient"
)

var (
	activeJobsMu sync.RWMutex
	activeJobs   = make(map[string]struct{})
)

// connectorResourceHeadroom is the share of the node's CPU/RAM the worker will
// reserve for connector containers. The rest is left for the worker itself, its
// legacy (in-process) tool jobs and the OS. Admission then uses each container's
// declared manifest limit as its request, so a burst of memory-heavy images
// (e.g. nuclei 4GiB) cannot exhaust RAM.
const connectorResourceHeadroom = 0.8

func connectInternalNetwork(ctx context.Context, grpcClient *grpcclient.Client, network string, events chan<- TuiEvent) error {
	log := NewTuiLogger(events, "Network")

	networkInfos, err := GetNetworkInfos(log)
	if err != nil {
		return fmt.Errorf("failed to get network infos: %w", err)
	}

	var networkInterfaces []*workers.NetworkInterfaceMessage
	for _, info := range networkInfos {
		networkInterfaces = append(networkInterfaces, &workers.NetworkInterfaceMessage{
			InterfaceName: info.Interface,
			IpAddress:     info.IP,
			Cidr:          info.CIDR,
			GatewayIp:     info.GatewayIP,
			GatewayMac:    info.GatewayMAC,
		})
	}

	if err := grpcClient.ConnectInternalNetwork(ctx, network, networkInterfaces); err != nil {
		return err
	}

	return nil
}

func Start(ctx context.Context, cfg *config.Config, events chan<- TuiEvent) {
	log := NewTuiLogger(events, "System")
	screenshotLog = NewTuiLogger(events, "Screenshot")

	grpcClient, err := grpcclient.NewClient(cfg.ApiKey, fmt.Sprintf("%s:%d", cfg.GrpcHost, cfg.GrpcPort), cfg.ToolPath, log)
	if err != nil {
		log.ErrorE("Failed to create OASM client", err)
		return
	}
	grpcClient.SetRunMode(cfg.Mode)

	// ponytail: lazy browser singleton — avoids ~300MB chromium resident when no screenshot jobs.
	var (
		browserOnce    sync.Once
		lazyBrowser    *rod.Browser
		lazyLauncher   *launcher.Launcher
		browserInitErr error
	)
	getBrowser := func() (*rod.Browser, error) {
		browserOnce.Do(func() {
			log.Info("Initializing headless browser (lazy)...")
			l := launcher.New().Leakless(false).Headless(true)
			if _, err := os.Stat("/usr/bin/chromium"); err == nil {
				log.Verbose("Using system chromium at /usr/bin/chromium")
				l = l.Bin("/usr/bin/chromium")
			} else if _, err := os.Stat("/usr/bin/chromium-browser"); err == nil {
				log.Verbose("Using system chromium at /usr/bin/chromium-browser")
				l = l.Bin("/usr/bin/chromium-browser")
			} else if _, err := os.Stat("/usr/bin/google-chrome"); err == nil {
				log.Verbose("Using system chromium at /usr/bin/google-chrome")
				l = l.Bin("/usr/bin/google-chrome")
			} else {
				log.Verbose("No system chromium found, go-rod will download Chrome automatically")
			}
			lazyLauncher = l
			url, err := l.Launch()
			if err != nil {
				browserInitErr = fmt.Errorf("browser launch failed: %w", err)
				return
			}
			b := rod.New().ControlURL(url)
			if err := b.Connect(); err != nil {
				browserInitErr = fmt.Errorf("browser connect failed: %w", err)
				// Best-effort cleanup on connect failure
				l.Cleanup()
				l.Kill()
				return
			}
			lazyBrowser = b
		})
		if browserInitErr != nil {
			return nil, browserInitErr
		}
		if lazyBrowser == nil {
			return nil, fmt.Errorf("browser not initialized")
		}
		return lazyBrowser, nil
	}

	workspaceRoot, err := filepath.Abs(cfg.WorkspaceRoot)
	if err != nil {
		log.ErrorE("Failed to resolve workspace root", err)
		return
	}

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		log.ErrorE("Failed to create workspace root", err)
		return
	}

	toolPath, err := filepath.Abs(cfg.ToolPath)
	if err != nil {
		log.ErrorE("Failed to resolve tool path", err)
		return
	}

	ready := make(chan bool, 1)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()

	// proxy and mgr are initialized after connector server setup but declared
	// here so the pollLoop closure can capture them by reference.
	var (
		proxy             *connector.Proxy
		mgr               *execution.Manager
		telemetryProvider *telemetry.Provider
	)

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	var wg sync.WaitGroup

	pollLoop := func(pollerCtx, sessionCtx context.Context) {
		policy := newPollPolicy()
		hadJobCh := make(chan bool, 64)
		timer := time.NewTimer(policy.backoff)
		defer timer.Stop()
		resetTimer := func(d time.Duration) {
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(d)
		}

		// dispatch acquires one free concurrency slot and starts a job pull/run.
		// Returns false when every slot is busy.
		dispatch := func() bool {
			select {
			case semaphore <- struct{}{}:
				wg.Add(1)
				go func(sc context.Context) {
					defer wg.Done()
					releaseSem := func() { <-semaphore }
					hadJob, usedAsync := processJob(sc, grpcClient, getBrowser, toolPath, events, mgr, proxy, releaseSem)
					if !usedAsync {
						releaseSem() // Legacy: release at return
					}
					// Connector path: semaphore released by completion handler asynchronously.
					select {
					case hadJobCh <- hadJob:
					default:
					}
				}(sessionCtx)
				return true
			default:
				return false
			}
		}

		// drainFeedback applies every completed poll's result so a burst of
		// completions is reflected before the next dispatch cycle.
		drainFeedback := func() {
			for {
				select {
				case hadJob := <-hadJobCh:
					policy.feedback(hadJob)
				default:
					return
				}
			}
		}

		for {
			select {
			case <-pollerCtx.Done():
				return
			case <-ctx.Done():
				return
			case hadJob := <-hadJobCh:
				wasFlowing := policy.flowing()
				policy.feedback(hadJob)
				// A job found while idle must trigger a quick refill instead of
				// waiting out the long backoff already armed on the timer.
				if !wasFlowing && policy.flowing() {
					resetTimer(pollRefillDelay)
				}
			case <-timer.C:
				drainFeedback()
				if sessionCtx == nil || sessionCtx.Err() != nil {
					resetTimer(pollMaxBackoff)
					continue
				}
				// Fill EVERY free slot, not one job per backoff tick: the old
				// cadence left most of the configured concurrency idle while
				// jobs sat pending in the registry.
				dispatched := 0
				for dispatched < policy.maxDispatch(cfg.MaxConcurrency) && dispatch() {
					dispatched++
				}
				resetTimer(policy.nextDelay(dispatched))
			}
		}
	}

	// The connection→poller lifecycle lives in runReadyConsumer so its state
	// machine is unit-testable: a duplicate or coalesced ready notification must
	// never leave the worker connected without a job poller.
	go runReadyConsumer(ctx, ready, readyDeps{
		setup: func(parent context.Context) (context.Context, context.CancelFunc) {
			sessionCtx, sessionCancel := context.WithCancel(parent)

			if cfg.Network != "" {
				if err := connectInternalNetwork(sessionCtx, grpcClient, cfg.Network, events); err != nil {
					log.ErrorE("Failed to connect internal network", err)
					sessionCancel()
					return nil, nil
				}
				log.Success("Connected to internal network: %s", cfg.Network)
			}

			if err := grpcClient.DownloadTools(sessionCtx); err != nil {
				log.ErrorE("Download tools failed", err)
				sessionCancel()
				return nil, nil
			}

			go startRemoteExecuteHandler(sessionCtx, grpcClient, workspaceRoot, toolPath, events)
			return sessionCtx, sessionCancel
		},
		startPoller: func(sessionCtx context.Context) context.CancelFunc {
			pollerCtx, pollerCancel := context.WithCancel(sessionCtx)
			go pollLoop(pollerCtx, sessionCtx)
			log.Success("Job poller started (concurrency: %d)", cfg.MaxConcurrency)
			return pollerCancel
		},
		onConnected: func() {
			log.Success("Worker connected/reconnected")
			Emit(events, TuiEvent{
				Type:     EventConnected,
				WorkerID: grpcClient.WorkerID(),
				Host:     cfg.GrpcHost,
				Port:     cfg.GrpcPort,
			})
		},
		onDisconnected: func() {
			log.Warning("Disconnected from core, suspending...")
			Emit(events, TuiEvent{
				Type:             EventDisconnected,
				DisconnectReason: "Connection lost",
			})
		},
	})

	// Connector machinery (gRPC server + Docker runtime) only for node mode.
	// CLI workers may not have Docker installed — they run built-in tools only.
	if cfg.Mode == "node" {
		// Start connector gRPC server for Docker connectors.
		// Non-fatal: worker can still operate legacy path without connector server.
		proxy = connector.NewProxy()
		proxy.SetLogger(log)
		connectorServer, err := connector.NewServer(
			// Bind all interfaces ("host:port" with an empty host): connector
			// containers reach this listener via host.docker.internal / bridge
			// IPs derived by resolveConnectorAddr. Never bind localhost — it
			// would place the listener on the worker's loopback, unreachable
			// from spawned containers. Guarded by TestConnectorServerBindsAllInterfaces.
			fmt.Sprintf(":%d", cfg.ConnectorPort),
			proxy,
			cfg.ConnectorToken,
		)
		if err != nil {
			log.Error("connector server init failed (non-fatal): %v", err)
		} else {
			connectorServer.SetLogger(log)
			// mTLS is env-gated (WORKER_CONNECTOR_TLS_CERT/KEY/CA, all three
			// required); without it the listener stays plaintext for backward
			// compatibility. Cert contents are never logged.
			if connectorServer.TLSEnabled() {
				log.Info("connector server: mutual TLS enabled (client certificates verified against WORKER_CONNECTOR_TLS_CA)")
			} else {
				log.Warning("connector server: running WITHOUT TLS (plaintext) — set WORKER_CONNECTOR_TLS_CERT, WORKER_CONNECTOR_TLS_KEY and WORKER_CONNECTOR_TLS_CA to require client certificates")
			}
			go func() {
				log.Success("connector server listening on %s", connectorServer.Addr())
				if err := connectorServer.Serve(workerCtx); err != nil {
					log.Warning("connector server stopped: %v", err)
				}
			}()
		}

		// Construct Docker runtime + execution manager for connector (image-based) jobs.
		// ponytail: when legacy command path retires, limit moves into Manager and semaphore dies.
		// Manager maxConcurrency=0 (unlimited) — the worker semaphore at :145 is the SOLE
		// concurrency gate for both legacy and connector paths.
		var mgrInit *execution.Manager
		if proxy != nil {
			// ConnectorAddr is an explicit override for the address containers use to reach
			// this worker. Precedence: cfg.ConnectorAddr (populated from the
			// WORKER_CONNECTOR_ADDR env by viper) > process env fallback > auto-derived
			// (container self IPv4 / host.docker.internal / bridge IPv4 gateway).
			// Empty = auto-derive; an IPv6 dial requires an explicit bracketed override.
			dockerRT, err := runtime.NewDockerRuntime("", cfg.ConnectorAddr, cfg.ConnectorPort, cfg.ConnectorToken)
			if err != nil {
				log.Error("container engine unavailable — image/connector jobs disabled: %v", err)
			} else {
				mgrInit = execution.NewManager(dockerRT, 0)
				mgrInit.SetLogger(log)
				dockerRT.SetLogger(log)
				// Per-execution single-use connector auth: the Manager mints a
				// token per execution (before container creation) and the
				// connector server validates Register against it.
				if connectorServer != nil {
					connectorServer.SetTokenLookup(mgrInit)
				} else {
					log.Warning("connector server unavailable — pooled container registration/auth skipped")
				}
				// Phase 2 warm pool: idle containers of the same image survive
				// their execution and are reused for the next job (finished =
				// idle, next acquire hits). WORKER_POOL_ENABLED=false keeps
				// the legacy 1:1 model (every execution gets its own
				// container, removed on Done).
				poolMode := "1 container = 1 execution"
				if cfg.PoolEnabled {
					pool := execution.NewPoolManager(
						time.Duration(cfg.ConnectorIdleTimeout)*time.Second,
						cfg.MaxReplicasPerImage,
						cfg.MaxJobsPerContainer,
					)
					// Admission is resource-based, not a fixed container count:
					// reserve a headroom-adjusted share of the node's CPU/RAM
					// and let each container's declared limit decide whether
					// another one still fits.
					cpus, memoryBytes := sysresources.Detect()
					pool.SetResourceBudget(
						int(float64(cpus)*1000*connectorResourceHeadroom),
						int(float64(memoryBytes)*connectorResourceHeadroom),
					)
					mgrInit.SetPool(pool)
					// Proxy routing: BindExec/ReleaseExec map executions to
					// pooled containers; RemoveContainer drops swept/dead ones.
					mgrInit.SetStreamBinder(proxy)
					mgrInit.SetEvictor(proxy)
					// Server handoff: Done → ReleaseToIdle (keep container +
					// stream alive), unexpected stream death → ContainerDown
					// (stop, remove, evict).
					if connectorServer != nil {
						connectorServer.SetPoolNotifier(mgrInit)
					}
					go mgrInit.SweepLoop(workerCtx)
					poolMode = fmt.Sprintf("warm pool: idle_timeout=%ds max_replicas_per_image=%d", cfg.ConnectorIdleTimeout, cfg.MaxReplicasPerImage)
				}
				// Startup orphan reconcile (3-tier): deliberately OUTSIDE the
				// pool branch — 1:1 mode leaks exited containers too. Runs
				// pre-join (Connect starts only after this block), so OwnerID
				// still reflects the boot identity and this process owns no
				// containers yet. Bounded to 30s so a hung engine cannot stall
				// startup; failures are logged by the runtime, never fatal.
				reconcileStartupOrphans(workerCtx, dockerRT, grpcClient.OwnerID(), 30*time.Second)
				log.Success("execution manager ready (Docker runtime, unlimited concurrency, %s)", poolMode)
			}
		}
		mgr = mgrInit
	}

	var telemetryManager telemetry.Manager
	if mgr != nil {
		telemetryManager = mgr
	}
	var connectorState telemetry.ConnectorState
	if proxy != nil {
		connectorState = proxy
	}
	telemetryProvider, err = telemetry.NewProvider(
		telemetryManager,
		connectorState,
		// In-flight jobs = concurrency-gate usage. A semaphore slot is taken the
		// moment a job is pulled and released only when it is finalized, so this
		// matches the registry's IN_PROGRESS jobs shown by the job graph / list.
		// The activeJobs map under-counts jobs queued behind the per-image pool,
		// which made the worker telemetry box disagree with the job graph.
		func() int { return len(semaphore) },
		cfg.MaxConcurrency,
		cfg.Mode,
		"dev",
	)
	if err != nil {
		log.Warning("worker telemetry disabled: failed to initialize provider: %v", err)
		telemetryProvider = nil
	} else {
		if cfg.Mode == "node" && mgr == nil {
			telemetryProvider.SetState(workers.WorkerRuntimeState_WORKER_RUNTIME_STATE_DEGRADED)
		}
		grpcClient.SetTelemetryProvider(telemetryProvider)
	}

	// Job cancellation pushed by core-api over the bidirectional worker stream.
	// Mirrors the internal teardown paths (health failure / connect timeout):
	// the execution is cancelled (stops + removes the container) and the drain
	// is unwound, which is what releases the concurrency slot and finalizes the
	// job. The concurrency slot is deliberately NOT released here — the drain owns
	// it, so releasing twice would corrupt the semaphore.
	grpcClient.SetStreamCancelHandler(func(jobID, reason string) {
		execID, running := findExecutionByJob(jobID)
		if !running {
			// Already finished, or it is a legacy in-process job with no
			// container to stop. Either way there is nothing to do.
			log.Info("cancel for job %s: no running container execution (reason=%s)", jobID, reason)
			return
		}
		log.Info("cancelling job %s on core request (reason=%s) exec=%s", jobID, reason, execID)
		if mgr != nil {
			cleanupCtx, cancelCleanup := newDetachedCleanupContext()
			if err := mgr.Cancel(cleanupCtx, execID); err != nil {
				log.ErrorE(fmt.Sprintf("[%s] Failed to cancel execution %s", jobID, execID), err)
			}
			cancelCleanup()
		}
		if proxy != nil {
			// Report the real reason instead of the generic "disconnected before
			// Done" the drain would otherwise finalise the job with.
			proxy.SetError(execID, fmt.Sprintf("cancelled: %s", reason))
			proxy.OnConnectorDown(execID)
		}
	})

	// Connect AFTER node-mode setup: the startup orphan reconcile above must
	// finish before this process can receive jobs (and thus create
	// containers), so a fresh container can never be misclassified as a
	// leftover of a previous run.
	go grpcClient.Connect(workerCtx, ready)

	ticker := time.NewTicker(time.Second)
	go func() {
		defer ticker.Stop()
		var lastLogged int
		for {
			select {
			case <-ticker.C:
				running := len(semaphore)

				if running != lastLogged {
					lastLogged = running
				}

				Emit(events, TuiEvent{
					Type:           EventMetrics,
					ActiveJobs:     running,
					MaxConcurrency: cfg.MaxConcurrency,
				})
			case <-ctx.Done():
				return
			}
		}
	}()

	<-ctx.Done()
	log.Info("Signal received, stopping...")
	// runReadyConsumer stops the poller and cancels the session when this ctx is
	// done, so no explicit cancel is needed here; in-flight jobs drain below.
	log.Info("Poller stopped, waiting for jobs...")

	wg.Wait()
	log.Info("All jobs finished")

	if lazyBrowser != nil {
		if err := lazyBrowser.Close(); err != nil {
			log.Warning("Browser close: %v", err)
		}
	}
	if lazyLauncher != nil {
		lazyLauncher.Kill()
		lazyLauncher.Cleanup()
	}
	// Shutdown drain: workerCancel() below only stops the pool SweepLoop —
	// without an explicit drain every idle pooled container would outlive the
	// worker (up-forever orphans). All jobs are done (wg.Wait above), so drain
	// stops+removes the idle containers first; busy containers carrying live
	// executions are untouched.
	if mgr != nil {
		mgr.DrainPool()
	}
	if telemetryProvider != nil {
		telemetryProvider.SetState(workers.WorkerRuntimeState_WORKER_RUNTIME_STATE_DRAINING)
		reportCtx, cancelReport := context.WithTimeout(context.Background(), 2*time.Second)
		if _, reportErr := grpcClient.ReportTelemetry(reportCtx); reportErr != nil {
			log.Warning("final worker telemetry report failed: %v", reportErr)
		}
		cancelReport()
	}
	log.Success("Shutdown complete")

	workerCancel()
}
