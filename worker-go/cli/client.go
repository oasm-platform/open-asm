package cli

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"time"

	"github.com/go-co-op/gocron"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func Connect(ctx context.Context, cfg Config) {
	client, err := oasm.NewClient(
		oasm.WithApiKey(cfg.ApiKey),
		oasm.WithGRPCHost("localhost:50051"),
		oasm.WithToolPath(cfg.ToolPath),
	)
	if err != nil {
		return
	}
	ready := make(chan bool, 1)

	go client.WorkerConnect(ctx, ready)

	semaphore := make(chan struct{}, 10)

	scheduler := gocron.NewScheduler(time.UTC)
	cronStarted := false

	_, err = scheduler.Every(1).Second().Do(func() {
		select {
		case semaphore <- struct{}{}:
			go func() {
				defer func() { <-semaphore }()
				processJob(ctx, client, cfg.ToolPath)
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
					log.Println("Gocron poller started (Max Concurrency: 10)")
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
			log.Println("CLI shutting down...")
			if cronStarted {
				scheduler.Stop()
			}
			return
		}
	}
}

func processJob(ctx context.Context, client *oasm.Client, toolPath string) {
	job, err := client.JobsNext(ctx)
	if err != nil {
		log.Printf("Failed to pull job: %v", err)
		return
	}
	if job == nil || job.Id == "" {
		return
	}

	cmdStr := job.GetCommand()
	if cmdStr == "" {
		log.Printf("Job %s has no command to execute", job.Id)
		client.JobsResult(ctx, job.Id, oasm.NewErrorResult("No command provided by Core"))
		return
	}

	log.Printf("Executing Job ID: %s | Command: %s", job.Id, cmdStr)

	cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)

	pathSep := string(os.PathListSeparator)
	customPath := fmt.Sprintf("PATH=%s%s%s", toolPath, pathSep, os.Getenv("PATH"))
	cmd.Env = append(os.Environ(), customPath)

	output, err := cmd.CombinedOutput()
	outStr := string(output)

	var payload *jobs_registry.DataPayloadResult

	if err != nil {
		log.Printf("Job %s failed: %v", job.Id, err)
		errMsg := fmt.Sprintf("Exec error: %v\nOutput: %s", err, outStr)
		payload = oasm.NewErrorResult(errMsg)
	} else {
		log.Printf("Job %s completed successfully", job.Id)

		payload = &jobs_registry.DataPayloadResult{
			Error: false,
			Raw:   &outStr,
		}
	}

	err = client.JobsResult(ctx, job.Id, payload)
	if err != nil {
		log.Printf("Failed to submit result for Job %s: %v", job.Id, err)
	}
}
