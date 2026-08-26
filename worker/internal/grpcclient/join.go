package grpcclient

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"

	workers "oasm-worker/internal/gen/workers"
)

// mapRunMode converts a string mode to the proto WorkerRunMode enum.
// Unknown non-empty values default to UNKNOWN.
func mapRunMode(mode string) workers.WorkerRunMode {
	switch strings.ToLower(mode) {
	case "cli":
		return workers.WorkerRunMode_WORKER_RUN_MODE_CLI
	case "node":
		return workers.WorkerRunMode_WORKER_RUN_MODE_NODE
	default:
		return workers.WorkerRunMode_WORKER_RUN_MODE_UNKNOWN
	}
}

// Join registers this worker with the core-api server using the client's API
// key, stores the assigned worker ID, and sets the worker token used to
// authenticate subsequent RPCs.
func (c *Client) Join(ctx context.Context) error {
	hostname, err := os.Hostname()
	var metadata *workers.WorkerMetadata
	if err == nil {
		osName := runtime.GOOS
		mode := mapRunMode(c.runMode)
		metadata = &workers.WorkerMetadata{
			Name: &hostname,
			Os:   &osName,
			Mode: &mode,
		}
	}

	req := &workers.JoinRequest{
		ApiKey:   c.apiKey,
		Metadata: metadata,
	}

	resp, err := c.workers.Join(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to join: %w", err)
	}

	c.mu.Lock()
	c.workerID = resp.WorkerId
	c.mu.Unlock()
	c.auth.setToken(resp.WorkerToken)
	return nil
}
