package client

import (
	"context"

	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

// Join registers this worker with core-api and stores the returned worker
// token on the client so subsequent RPCs are authenticated automatically.
// Join itself is unguarded server-side; the token is only needed for later
// Next/Result* calls.
func (c *Client) Join(ctx context.Context, apiKey, signature string) (workerID, workerToken string, err error) {
	// Call the embedded client explicitly — c.Join would shadow-recurse.
	resp, err := c.WorkersServiceClient.Join(ctx, &workers.JoinRequest{
		ApiKey:    apiKey,
		Signature: signature,
	})
	if err != nil {
		return "", "", err
	}

	c.SetToken(resp.WorkerToken)
	return resp.WorkerId, resp.WorkerToken, nil
}
