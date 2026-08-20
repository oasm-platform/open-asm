package grpcclient

import (
	"context"
	"io"

	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

// Alive opens the server-streaming Alive channel and consumes heartbeats until
// the server closes the stream (io.EOF -> nil) or an error occurs.
func (c *Client) Alive(ctx context.Context) error {
	req := &workers.AliveRequest{WorkerToken: c.auth.currentToken()}
	stream, err := c.workers.Alive(ctx, req)
	if err != nil {
		return err
	}

	for {
		_, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
	}
}
