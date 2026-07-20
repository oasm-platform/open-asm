package worker

import (
	"context"
	"fmt"
	"oasm-worker/internal/config"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/go-co-op/gocron"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

var (
	activeJobsMu sync.RWMutex
	activeJobs   = make(map[string]struct{})
)

func connectInternalNetwork(client *oasm.Client, network string) error {
	networkInfos, err := GetNetworkInfos()
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

	req := &workers.ConnectInternalNetworkRequest{
		WorkerId:          client.WorkerID(),
		NetworkId:         network,
		NetworkInterfaces: networkInterfaces,
	}

	_, err = client.Workers().ConnectInternalNetwork(client.WithAuth(context.Background()), req)
	if err != nil {
		return fmt.Errorf("error connecting internal network: %w", err)
	}

	return nil
}

func Start(ctx context.Context, cfg *config.Config, events chan<- TuiEvent) {
	log := NewTuiLogger(events, "System")
	screenshotLog = NewTuiLogger(events, "Screenshot")

	client, err := oasm.NewClient(
		oasm.WithApiKey(cfg.ApiKey),
		oasm.WithGRPCHost(fmt.Sprintf("%s:%d", cfg.GrpcHost, cfg.GrpcPort)),
		oasm.WithToolPath(cfg.ToolPath),
	)
	if err != nil {
		log.ErrorE("Failed to create OASM client", err)
		return
	}

	log.Info("Initializing headless browser...")
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

	browser := rod.New().ControlURL(l.MustLaunch()).MustConnect()

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
		stateMu          sync.Mutex
		sessionCtx       context.Context
		sessionCancel    context.CancelFunc
		schedulerStarted bool
	)

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	scheduler := gocron.NewScheduler(time.UTC)
	var wg sync.WaitGroup

	_, err = scheduler.Every(1).Second().Do(func() {
		stateMu.Lock()
		currentCtx := sessionCtx
		stateMu.Unlock()

		if currentCtx == nil || currentCtx.Err() != nil {
			return
		}

		select {
		case semaphore <- struct{}{}:
			wg.Go(func() {
				defer func() { <-semaphore }()
				processJob(currentCtx, client, browser, toolPath, events)
			})
		default:
		}
	})
	if err != nil {
		log.ErrorE("Failed to schedule job", err)
		return
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
						WorkerID: client.WorkerID(),
						Host:     cfg.GrpcHost,
						Port:     cfg.GrpcPort,
					})

					if cfg.Network != "" {
						if err := connectInternalNetwork(client, cfg.Network); err != nil {
							log.ErrorE("Failed to connect internal network", err)
							stateMu.Unlock()
							continue
						}
						log.Success("Connected to internal network: %s", cfg.Network)
					}

					if err := client.WorkerDownloadTools(sessionCtx); err != nil {
						log.ErrorE("Download tools failed", err)
						stateMu.Unlock()
						continue
					}

					go startRemoteExecuteHandler(sessionCtx, client, workspaceRoot, toolPath, events)

					if !schedulerStarted {
						scheduler.StartAsync()
						log.Success("Job poller started (concurrency: %d)", cfg.MaxConcurrency)
						schedulerStarted = true
					}
				} else {
					log.Warning("Disconnected from core, suspending...")
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

	go client.WorkerConnect(workerCtx, ready)

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

	scheduler.Stop()
	log.Info("Scheduler stopped, waiting for jobs...")

	wg.Wait()
	log.Info("All jobs finished")

	stateMu.Lock()
	if sessionCancel != nil {
		sessionCancel()
	}
	stateMu.Unlock()

	if err := browser.Close(); err != nil {
		log.Warning("Browser close: %v", err)
	}
	l.Kill()
	l.Cleanup()
	log.Success("Shutdown complete")

	workerCancel()
}
