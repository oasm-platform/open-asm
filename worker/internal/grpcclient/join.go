package grpcclient

import (
	"context"
	"fmt"
	"os"
	"runtime"

	workers "oasm-worker/internal/gen/workers"
)

// Join registers this worker with the core-api server using the client's API
// key, stores the assigned worker ID, and sets the worker token used to
// authenticate subsequent RPCs.
func (c *Client) Join(ctx context.Context) error {
	hostname, err := os.Hostname()
	var metadata *workers.WorkerMetadata
	if err == nil {
		osName := runtime.GOOS
		metadata = &workers.WorkerMetadata{
			Name: &hostname,
			Os:   &osName,
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
