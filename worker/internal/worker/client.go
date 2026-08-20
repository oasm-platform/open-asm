package worker

import (
	"context"
	"fmt"
	"oasm-worker/internal/config"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/oasm-platform/open-asm/grpc-client/go/workers"

	"oasm-worker/internal/grpcclient"
)

var (
	activeJobsMu sync.RWMutex
	activeJobs   = make(map[string]struct{})
)

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

	var (
		stateMu       sync.Mutex
		sessionCtx    context.Context
		sessionCancel context.CancelFunc
		pollerCancel  context.CancelFunc
	)

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	var wg sync.WaitGroup

	pollLoop := func(pollerCtx context.Context) {
		backoff := time.Second
		const maxBackoff = 5 * time.Second
		hadJobCh := make(chan bool, 64)
		timer := time.NewTimer(backoff)
		defer timer.Stop()
		for {
			select {
			case <-pollerCtx.Done():
				return
			case <-ctx.Done():
				return
			case hadJob := <-hadJobCh:
				if hadJob {
					backoff = time.Second
				} else {
					backoff *= 2
					if backoff > maxBackoff {
						backoff = maxBackoff
					}
				}
			case <-timer.C:
				// Apply any pending feedback before choosing next interval
				select {
				case hadJob := <-hadJobCh:
					if hadJob {
						backoff = time.Second
					} else {
						backoff *= 2
						if backoff > maxBackoff {
							backoff = maxBackoff
						}
					}
				default:
				}
				stateMu.Lock()
				cur := sessionCtx
				stateMu.Unlock()
				if cur == nil || cur.Err() != nil {
					backoff *= 2
					if backoff > maxBackoff {
						backoff = maxBackoff
					}
					timer.Reset(backoff)
					continue
				}
				select {
				case semaphore <- struct{}{}:
					wg.Add(1)
					go func(sc context.Context) {
						defer func() {
							<-semaphore
							wg.Done()
						}()
						hadJob := processJob(sc, grpcClient, getBrowser, toolPath, events)
						select {
						case hadJobCh <- hadJob:
						default:
						}
					}(cur)
					timer.Reset(backoff)
				default:
					timer.Reset(500 * time.Millisecond)
				}
			}
		}
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				stateMu.Lock()
				if sessionCancel != nil {
					sessionCancel()
				}
				stateMu.Unlock()
				return
			case isConnected, ok := <-ready:
				if !ok {
					return
				}

				stateMu.Lock()
				if sessionCancel != nil {
					sessionCancel()
				}

				if isConnected {
					log.Success("Worker connected/reconnected")
					sessionCtx, sessionCancel = context.WithCancel(ctx)

					Emit(events, TuiEvent{
						Type:     EventConnected,
						WorkerID: grpcClient.WorkerID(),
						Host:     cfg.GrpcHost,
						Port:     cfg.GrpcPort,
					})

					if cfg.Network != "" {
						if err := connectInternalNetwork(sessionCtx, grpcClient, cfg.Network, events); err != nil {
							log.ErrorE("Failed to connect internal network", err)
							stateMu.Unlock()
							continue
						}
						log.Success("Connected to internal network: %s", cfg.Network)
					}

					if err := grpcClient.DownloadTools(sessionCtx); err != nil {
						log.ErrorE("Download tools failed", err)
						stateMu.Unlock()
						continue
					}

					go startRemoteExecuteHandler(sessionCtx, grpcClient, workspaceRoot, toolPath, events)

					var pollerCtx context.Context
					pollerCtx, pollerCancel = context.WithCancel(sessionCtx)
					go pollLoop(pollerCtx)
					log.Success("Job poller started (concurrency: %d)", cfg.MaxConcurrency)
				} else {
					log.Warning("Disconnected from core, suspending...")
					if pollerCancel != nil {
						pollerCancel()
						pollerCancel = nil
					}
					sessionCtx = nil
					sessionCancel = nil

					Emit(events, TuiEvent{
						Type:             EventDisconnected,
						DisconnectReason: "Connection lost",
					})
				}
				stateMu.Unlock()
			}
		}
	}()

	go grpcClient.Connect(workerCtx, ready)

	ticker := time.NewTicker(time.Second)
	go func() {
		defer ticker.Stop()
		var lastLogged int
		for {
			select {
			case <-ticker.C:
				activeJobsMu.RLock()
				running := len(activeJobs)
				activeJobsMu.RUnlock()

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

	if pollerCancel != nil {
		pollerCancel()
	}
	log.Info("Poller stopped, waiting for jobs...")

	wg.Wait()
	log.Info("All jobs finished")

	stateMu.Lock()
	if sessionCancel != nil {
		sessionCancel()
	}
	stateMu.Unlock()

	if lazyBrowser != nil {
		if err := lazyBrowser.Close(); err != nil {
			log.Warning("Browser close: %v", err)
		}
	}
	if lazyLauncher != nil {
		lazyLauncher.Kill()
		lazyLauncher.Cleanup()
	}
	log.Success("Shutdown complete")

	workerCancel()
}
