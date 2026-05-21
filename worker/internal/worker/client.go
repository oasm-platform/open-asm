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
	activeJobsMu sync.Mutex
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

func Start(ctx context.Context, cfg *config.Config) {
	sysLog := oasm.NewLogger("System")
	jobLog := oasm.NewLogger("Jobs")
	netLog := oasm.NewLogger("Network")
	shutLog := oasm.NewLogger("Shutdown")

	client, err := oasm.NewClient(
		oasm.WithApiKey(cfg.ApiKey),
		oasm.WithGRPCHost(fmt.Sprintf("%s:%d", cfg.GrpcHost, cfg.GrpcPort)),
		oasm.WithToolPath(cfg.ToolPath),
	)
	if err != nil {
		sysLog.ErrorE("Failed to create OASM client", err)
		return
	}

	jobLog.Info("Initializing headless browser...")

	l := launcher.New().Leakless(false).Headless(true)

	if _, err := os.Stat("/usr/bin/chromium"); err == nil {
		jobLog.Verbose("Using system chromium at /usr/bin/chromium")
		l = l.Bin("/usr/bin/chromium")
	} else if _, err := os.Stat("/usr/bin/chromium-browser"); err == nil {
		jobLog.Verbose("Using system chromium at /usr/bin/chromium-browser")
		l = l.Bin("/usr/bin/chromium-browser")
	} else if _, err := os.Stat("/usr/bin/google-chrome"); err == nil {
		jobLog.Verbose("Using system chromium at /usr/bin/google-chrome")
		l = l.Bin("/usr/bin/google-chrome")
	} else {
		jobLog.Verbose("No system chromium found, go-rod will download Chrome automatically")
	}

	browser := rod.New().ControlURL(l.MustLaunch()).MustConnect()

	ready := make(chan bool, 1)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	jobsCtx, jobsCancel := context.WithCancel(context.Background())
	defer jobsCancel()

	go client.WorkerConnect(workerCtx, ready)

	isConnected, ok := <-ready
	if !ok || !isConnected {
		sysLog.Error("Worker failed to join. Shutting down...")
		workerCancel()
		return
	}

	if cfg.Network != "" {
		if err := connectInternalNetwork(client, cfg.Network); err != nil {
			netLog.ErrorE("Failed to connect internal network", err)
			workerCancel()
			return
		}
		netLog.Success("Connected to internal network: %s", cfg.Network)
	}

	sysLog.Info("Core is ready, syncing tools...")
	if err := client.WorkerDownloadTools(ctx); err != nil {
		sysLog.ErrorE("Download tools failed", err)
		workerCancel()
		return
	}

	workspaceRoot, err := filepath.Abs(cfg.WorkspaceRoot)
	if err != nil {
		sysLog.ErrorE("Failed to resolve workspace root", err)
		workerCancel()
		return
	}

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		sysLog.ErrorE("Failed to create workspace root", err)
		workerCancel()
		return
	}

	remoteLog := oasm.NewLogger("RemoteExec")
	go startRemoteExecuteHandler(ctx, client, workspaceRoot, cfg.ToolPath)
	remoteLog.Info("Remote execute handler started (workspace: %s)", workspaceRoot)

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	scheduler := gocron.NewScheduler(time.UTC)

	var wg sync.WaitGroup
	var lastLogged int

	logJobStatus := func(running int) {
		jobLog.Verbose("Jobs running: %d/%d", running, cfg.MaxConcurrency)
	}

	logJobStatus(0)
	lastLogged = 0

	_, err = scheduler.Every(1).Second().Do(func() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		select {
		case semaphore <- struct{}{}:
			wg.Go(func() {
				defer func() { <-semaphore }()
				processJob(jobsCtx, client, browser, cfg.ToolPath, &activeJobsMu, &activeJobs)
			})
		default:
		}
	})
	if err != nil {
		sysLog.ErrorE("Failed to schedule job", err)
		return
	}

	scheduler.StartAsync()
	jobLog.Success("Gocron poller started (Max Concurrency: %d)", cfg.MaxConcurrency)

	ticker := time.NewTicker(time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				activeJobsMu.Lock()
				running := len(activeJobs)
				activeJobsMu.Unlock()

				if running != lastLogged {
					logJobStatus(running)
					lastLogged = running
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	<-ctx.Done()
	shutLog.Info("Signal received. Stopping scheduler...")

	scheduler.Stop()
	shutLog.Info("Scheduler stopped. Waiting for running jobs to finish...")

	wg.Wait()
	shutLog.Info("All jobs completed. Cancelling job context...")
	jobsCancel()

	if err := browser.Close(); err != nil {
		shutLog.Warning("Browser close warning: %v", err)
	}
	l.Kill()
	l.Cleanup()
	shutLog.Success("Browser killed safely")

	workerCancel()
	shutLog.Success("Worker shut down safely")
}
