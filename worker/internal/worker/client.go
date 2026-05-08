// Package worker
package worker

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"oasm-worker/internal/config"

	"github.com/go-co-op/gocron"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/oasm-platform/open-asm/grpc-client/go/workers"
	"google.golang.org/grpc/metadata"
)

// Track active jobs for logging
var (
	activeJobsMu sync.Mutex
	activeJobs   = make(map[string]struct{})
)

func connectInternalNetwork(client *oasm.Client, network string, workerID string, token string) error {
	networkInfos, err := GetNetworkInfos()
	if err != nil {
		return fmt.Errorf("failed to get network infos: %v", err)
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
		WorkerId:         workerID,
		NetworkId:        network,
		NetworkInterfaces: networkInterfaces,
	}

	ctx := context.Background()
	md := metadata.Pairs("worker-token", token)
	ctx = metadata.NewOutgoingContext(ctx, md)
	_, err = client.Workers().ConnectInternalNetwork(ctx, req)
	if err != nil {
		return fmt.Errorf("error connecting internal network: %v", err)
	}

	return nil
}

func Start(ctx context.Context, cfg *config.Config, network string) {
	client, err := oasm.NewClient(
		oasm.WithApiKey(cfg.ApiKey),
		oasm.WithGRPCHost(fmt.Sprintf("%s:%d", cfg.GrpcHost, cfg.GrpcPort)),
		oasm.WithToolPath(cfg.ToolPath),
	)
	if err != nil {
		log.Printf("Error creating OASM client: %v", err)
		return
	}

	// Get worker ID by joining first
	joinResp, err := client.WorkerJoin(context.Background())
	if err != nil {
		log.Printf("Error joining worker: %v", err)
		return
	}
	workerID := joinResp.WorkerId
	token := joinResp.WorkerToken

	oasm.Logger("Jobs").Verbose("Initializing headless browser...")

	l := launcher.New().
		Leakless(false). // Disable leakless to avoid Windows Defender false positive
		Headless(true)   // Explicit headless mode

	// Use system chromium if available, otherwise go-rod will download Chrome
	if _, err := os.Stat("/usr/bin/chromium"); err == nil {
		oasm.Logger("Jobs").Verbose("Using system chromium at /usr/bin/chromium")
		l = l.Bin("/usr/bin/chromium")
	} else if _, err := os.Stat("/usr/bin/chromium-browser"); err == nil {
		oasm.Logger("Jobs").Verbose("Using system chromium at /usr/bin/chromium-browser")
		l = l.Bin("/usr/bin/chromium-browser")
	} else {
		oasm.Logger("Jobs").Verbose("No system chromium found, go-rod will download Chrome automatically")
	}

	browser := rod.New().
		ControlURL(l.MustLaunch()).
		MustConnect()
	defer browser.MustClose()
	defer l.Cleanup() // Remove user data directory

	ready := make(chan bool, 1)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()

	go client.WorkerConnect(workerCtx, ready)

	// Wait for worker connection result
	isConnected, ok := <-ready
	if !ok || !isConnected {
		log.Println("Worker failed to join. Shutting down...")
		workerCancel()
		return
	}

	// Handle network connection if network is specified
	if network != "" {
		if err := connectInternalNetwork(client, network, workerID, token); err != nil {
			log.Printf("Failed to connect internal network: %v", err)
			workerCancel()
			return
		}
		log.Printf("Connected internal network successfully")
	}

	oasm.Logger("Sync").Verbose("Core is ready, syncing tools...")
	if err := client.WorkerDownloadTools(ctx); err != nil {
		oasm.Logger("Sync").Error(fmt.Sprintf("Download tools error: %v", err))
		workerCancel()
		return
	}

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	scheduler := gocron.NewScheduler(time.UTC)

	var wg sync.WaitGroup
	var lastLogged int // Track last logged running count for change detection

	// Helper function to log job status
	logJobStatus := func(running, maxConcurrency int) {
		oasm.Logger("Jobs").Verbose(fmt.Sprintf("Jobs running: %d/%d", running, maxConcurrency))
	}

	// Log initial state before starting scheduler
	logJobStatus(0, cfg.MaxConcurrency)
	lastLogged = 0

	_, err = scheduler.Every(1).Second().Do(func() {
		select {
		case semaphore <- struct{}{}:
			wg.Go(func() {
				defer func() { <-semaphore }()
				processJob(workerCtx, client, browser, cfg.ToolPath, &activeJobsMu, &activeJobs)
			})
		default:
		}
	})
	if err != nil {
		log.Fatalf("Failed to schedule job: %v", err)
	}

	scheduler.StartAsync()
	oasm.Logger("Jobs").Verbose(fmt.Sprintf("Gocron poller started (Max Concurrency: %d)\n", cfg.MaxConcurrency))

	ticker := time.NewTicker(time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				running := len(semaphore)
				if running != lastLogged {
					logJobStatus(running, cfg.MaxConcurrency)
					lastLogged = running
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	<-ctx.Done()
	log.Println("Received shutdown signal. Initiating graceful shutdown...")

	scheduler.Stop()
	log.Println("Job scheduler stopped.")

	log.Println("Waiting for running jobs to finish...")
	wg.Wait()
	workerCancel()

	log.Println("All running jobs have completed successfully.")
	log.Println("Worker shut down safely.")
}
