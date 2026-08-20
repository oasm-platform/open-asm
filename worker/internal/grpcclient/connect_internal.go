package grpcclient

import (
	"context"
	"fmt"

	workers "oasm-worker/internal/gen/workers"
)

// ConnectInternalNetwork reports the worker's network interfaces for the
// given internal network to core-api.
func (c *Client) ConnectInternalNetwork(ctx context.Context, networkID string, interfaces []*workers.NetworkInterfaceMessage) error {
	req := &workers.ConnectInternalNetworkRequest{
		WorkerId:          c.WorkerID(),
		NetworkId:         networkID,
		NetworkInterfaces: interfaces,
	}
	_, err := c.workers.ConnectInternalNetwork(ctx, req)
	if err != nil {
		return fmt.Errorf("error connecting internal network: %w", err)
	}
	return nil
}
