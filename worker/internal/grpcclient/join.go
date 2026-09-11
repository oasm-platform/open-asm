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
// authenticate subsequent RPCs. A persisted token (from a previous run) is
// sent along so the server re-uses the same worker identity; the (possibly
// rotated) returned token is persisted for the next restart.
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
	if tok := c.auth.currentToken(); tok != "" {
		req.Token = &tok
	}
	if c.signature != "" {
		req.Signature = c.signature
	}

	resp, err := c.workers.Join(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to join: %w", err)
	}

	c.mu.Lock()
	c.workerID = resp.WorkerId
	c.mu.Unlock()
	c.auth.setToken(resp.WorkerToken)

	// Persist the token so a restart can rejoin with the same identity.
	// Non-fatal: losing persistence only means the next start registers fresh.
	if err := c.persistToken(resp.WorkerToken); err != nil {
		c.logger.Warning("failed to persist worker token to %s: %v", c.tokenFile, err)
	}
	return nil
}

// persistToken writes the worker token to the token file with owner-only
// permissions so a later restart can resume the same worker identity.
func (c *Client) persistToken(tok string) error {
	if c.tokenFile == "" || tok == "" {
		return nil
	}
	return os.WriteFile(c.tokenFile, []byte(tok+"\n"), 0o600)
}
