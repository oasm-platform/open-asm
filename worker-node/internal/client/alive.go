package client

import (
	"context"

	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

// Alive opens a server-streaming Alive stream to core-api and forwards every
// heartbeat (pushed ~every 10s) to onHeartbeat. It returns only when the
// stream ends or the context is cancelled; no reconnect/backoff happens here —
// the worker loop owns that.
func (c *Client) Alive(ctx context.Context, workerToken string, onHeartbeat func(*workers.AliveResponse)) error {
	// Call the embedded client explicitly — c.Alive would shadow-recursse.
	stream, err := c.WorkersServiceClient.Alive(ctx, &workers.AliveRequest{
		WorkerToken: workerToken,
	})
	if err != nil {
		return err
	}

	for {
		resp, err := stream.Recv()
		if err != nil {
			return err
		}
		onHeartbeat(resp)
	}
}
