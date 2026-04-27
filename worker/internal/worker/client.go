// Package worker
package worker

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"oasm-worker/internal/config"

	"github.com/go-co-op/gocron"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
)

// Track active jobs for logging
var (
	activeJobsMu sync.Mutex
	activeJobs   = make(map[string]struct{})
)

func Start(ctx context.Context, cfg *config.Config) {
	client, err := oasm.NewClient(
		oasm.WithApiKey(cfg.ApiKey),
		oasm.WithGRPCHost(fmt.Sprintf("%s:%d", cfg.GrpcHost, cfg.GrpcPort)),
		oasm.WithToolPath(cfg.ToolPath),
	)
	if err != nil {
		log.Printf("Error creating OASM client: %v", err)
		return
	}

	log.Println("Initializing headless browser...")
	l := launcher.New().
		Leakless(false). // Disable leakless to avoid Windows Defender false positive
		Headless(true)   // Explicit headless mode

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

	log.Println("Core is ready, syncing tools...")
	if err := client.WorkerDownloadTools(ctx); err != nil {
		log.Printf("Download tools error: %v", err)
		workerCancel()
		return
	}

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	scheduler := gocron.NewScheduler(time.UTC)

	var wg sync.WaitGroup
	var lastLogged int // Track last logged running count for change detection

	// Helper function to log job status
	logJobStatus := func(running, maxConcurrency int) {
		log.Printf("Jobs running: %d/%d", running, maxConcurrency)
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
	log.Printf("Gocron poller started (Max Concurrency: %d)\n", cfg.MaxConcurrency)

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
