package grpcclient

import (
	"context"
	"time"
)

// Connect runs the join/alive loop until ctx is cancelled, reporting the
// connection state on ready (non-blocking): true after a successful join,
// false on join failure or when the alive stream ends.
func (c *Client) Connect(ctx context.Context, ready chan<- bool) {
	currentDelay := c.connectBaseDelay
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := c.Join(ctx)
		if err != nil {
			select {
			case ready <- false:
			default:
			}
			c.logger.ErrorE("join failed, retrying", err)
			if !c.waitWithContext(ctx, currentDelay) {
				return
			}
			currentDelay *= 2
			if currentDelay > c.connectMaxDelay {
				currentDelay = c.connectMaxDelay
			}
			continue
		}

		currentDelay = c.connectBaseDelay
		c.logger.Success("joined, worker_id=%s", c.WorkerID())

		select {
		case ready <- true:
		default:
		}

		err = c.Alive(ctx)

		select {
		case ready <- false:
		default:
		}

		if err != nil {
			c.logger.Warning("alive stream ended: %v", err)
		}

		if !c.waitWithContext(ctx, c.reconnectDelay) {
			return
		}
	}
}

// waitWithContext waits for delay, returning false early if ctx is cancelled.
func (c *Client) waitWithContext(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
