// Package worker implements the worker-node orchestration loop: it joins
// core-api, keeps an Alive heartbeat stream open, and polls for jobs which
// it executes via the runner, submitting every result (including failures)
// back to core-api.
package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"

	"worker-node/internal/client"
	"worker-node/internal/config"
	"worker-node/internal/runner"
)

const (
	joinRetryInterval = 3 * time.Second
	pollInterval      = 1 * time.Second
)

// Run connects to core-api, registers this worker, and drives the job
// processing loop until ctx is cancelled. It returns nil on graceful
// shutdown and the client-dial error when the connection cannot be created.
func Run(ctx context.Context, cfg *config.Config) error {
	c, err := client.New(cfg.GRPCHost, cfg.GRPCPort)
	if err != nil {
		return err
	}
	defer c.Close()

	// workerID/workerToken are written by the Alive goroutine (which
	// re-joins to refresh the token when the heartbeat stream drops) and read
	// by the poll loop, so both are guarded by this mutex.
	var (
		mu          sync.RWMutex
		workerID    string
		workerToken string
	)

	// join registers with core-api and stores the fresh credentials. It is
	// used both for the initial registration and for re-joining after an
	// Alive stream drop.
	join := func() error {
		id, token, err := c.Join(ctx, cfg.APIKey, cfg.Signature)
		if err != nil {
			return err
		}
		mu.Lock()
		workerID = id
		workerToken = token
		mu.Unlock()
		slog.Info("joined", "worker_id", id)
		return nil
	}

	// Initial join with retry: core-api may not be reachable yet when the
	// worker boots, so keep trying until it succeeds or ctx is cancelled.
	for {
		if err := join(); err == nil {
			break
		}
		slog.Error("join failed, retrying", "err", err)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		time.Sleep(joinRetryInterval)
	}

	var wg sync.WaitGroup

	// Heartbeat goroutine: keeps the Alive stream open and re-joins to get a
	// fresh token whenever the stream drops. It exits when ctx is cancelled.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			mu.RLock()
			token := workerToken
			mu.RUnlock()

			err := c.Alive(ctx, token, func(resp *workers.AliveResponse) {
				slog.Debug("heartbeat", "worker_id", resp.GetWorkerId(), "last_seen", resp.GetLastSeenAt())
			})
			if ctx.Err() != nil {
				return
			}
			slog.Warn("alive stream ended, re-joining", "err", err)

			// Re-join until a fresh token is obtained or the context dies.
			for {
				jerr := join()
				if jerr == nil {
					break
				}
				slog.Error("re-join failed, retrying", "err", jerr)
				if ctx.Err() != nil {
					return
				}
				time.Sleep(joinRetryInterval)
			}
		}
	}()

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// sem bounds in-flight jobs to cfg.MaxConcurrency; acquisition is
	// non-blocking so a full worker simply skips that poll tick.
	sem := make(chan struct{}, cfg.MaxConcurrency)

	for {
		select {
		case <-ctx.Done():
			ticker.Stop()
			wg.Wait()
			return nil
		case <-ticker.C:
			select {
			case sem <- struct{}{}:
				// Snapshot the current workerID: it can change when the
				// Alive goroutine re-joins after a stream drop.
				mu.RLock()
				id := workerID
				mu.RUnlock()

				wg.Add(1)
				go func() {
					defer wg.Done()
					defer func() { <-sem }()
					processJob(ctx, c, id)
				}()
			default:
				// All concurrency slots busy; skip this tick.
			}
		}
	}
}

// processJob pulls one job for the worker and executes it, submitting the
// result — including failures, so core-api can mark the job as errored —
// back to core-api.
func processJob(ctx context.Context, c *client.Client, workerID string) {
	job, err := c.Next(ctx)
	if err != nil {
		slog.Warn("next failed", "err", err)
		return
	}
	if job == nil || job.GetId() == "" {
		return
	}

	slog.Info("job started", "job_id", job.GetId(), "category", job.GetCategory())
	raw, runErr := runner.ShellRunner{}.Run(ctx, job)
	if err := c.SubmitResult(ctx, workerID, job.GetId(), job.GetCategory(), runErr != nil, raw); err != nil {
		slog.Error("submit result failed", "job_id", job.GetId(), "err", err)
	} else {
		slog.Info("job done", "job_id", job.GetId(), "errored", runErr != nil)
	}
}
