package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	"oasm-worker/internal/config"

	"github.com/go-co-op/gocron"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
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

	log.Println("Initializing headless browser for screenshots...")
	l := launcher.New().
		Leakless(false). // Disable leakless to avoid Windows Defender false positive
		Headless(true)   // Explicit headless mode

	browser := rod.New().
		ControlURL(l.MustLaunch()).
		MustConnect()
	defer browser.MustClose()
	defer l.Cleanup() // Remove user data directory

	ready := make(chan bool, 1)
	go client.WorkerConnect(ctx, ready)

	semaphore := make(chan struct{}, cfg.MaxConcurrency)
	scheduler := gocron.NewScheduler(time.UTC)
	cronStarted := false

	_, err = scheduler.Every(1).Second().Do(func() {
		select {
		case semaphore <- struct{}{}:
			go func() {
				defer func() { <-semaphore }()
				processJob(ctx, client, browser, cfg.ToolPath)
			}()
		default:
		}
	})
	if err != nil {
		log.Fatalf("Failed to schedule job: %v", err)
	}

	for {
		select {
		case isConnected := <-ready:
			if isConnected {
				log.Println("Core is ready, syncing tools...")
				if err := client.WorkerDownloadTools(ctx); err != nil {
					log.Printf("Download tools error: %v", err)
					continue
				}

				if !cronStarted {
					scheduler.StartAsync()
					cronStarted = true
					log.Printf("Gocron poller started (Max Concurrency: %d)\n", cfg.MaxConcurrency)
				}
			} else {
				log.Println("Waiting for stable connection to Core...")
				if cronStarted {
					scheduler.Stop()
					cronStarted = false
					log.Println("Gocron poller paused due to network loss.")
				}
			}

		case <-ctx.Done():
			log.Println("Worker shutting down...")
			if cronStarted {
				scheduler.Stop()
			}
			return
		}
	}
}
