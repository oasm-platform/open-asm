package grpcclient

import (
	"context"
	"sync"
	"time"
)

// Connect runs the join/alive loop until ctx is cancelled, reporting the
// connection state on ready: true after a successful join, false on join
// failure or when the alive stream ends. Notifications never block the
// join/alive loop and always reflect the newest state (see notifyReady).
func (c *Client) Connect(ctx context.Context, ready chan bool) {
	currentDelay := c.connectBaseDelay
	// The bidirectional stream outlives any single join/alive cycle: it owns
	// its own reconnect loop and ctx is the process-lifetime worker context, not
	// the per-iteration one. Starting it per iteration would leave the previous
	// goroutine running, and the survivors would each keep (re)opening a stream,
	// evicting each other from the server's registry — churn that silently drops
	// cancels. Start it exactly once, after the first successful join (it needs
	// the token that Join hands back).
	var streamOnce sync.Once
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := c.Join(ctx)
		if err != nil {
			notifyReady(ready, false)
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

		notifyReady(ready, true)

		telemetryCtx, stopTelemetry := context.WithCancel(ctx)
		telemetryDone := c.startTelemetry(telemetryCtx)

		// Additive: a bidirectional stream that carries job cancels. It is owned
		// by its own goroutine so a stream failure never disturbs the
		// Join/Alive lifecycle that gates the ready state and the poller.
		streamOnce.Do(func() { go c.runWorkerStream(ctx) })

		err = c.Alive(ctx)
		stopTelemetry()
		<-telemetryDone

		notifyReady(ready, false)

		if err != nil {
			c.logger.Warning("alive stream ended: %v", err)
		}

		if !c.waitWithContext(ctx, c.reconnectDelay) {
			return
		}
	}
}

// notifyReady publishes the newest connection state without ever leaving a
// stale value queued in front of it.
//
// Connect reports state on a small channel and must never block the join/alive
// loop, while the consumer can be busy for seconds running network setup and
// tool downloads when a real reconnect happens. A plain non-blocking send keeps
// the OLDEST pending value and drops the newest: a `false` queued during a blip
// would then be delivered after the worker had already reconnected, stopping the
// job poller and never restarting it — the worker stays online yet pulls no
// jobs. Here a full buffer is drained first so the newest state always wins.
func notifyReady(ready chan bool, state bool) {
	select {
	case ready <- state:
		return
	default:
	}
	// The buffer holds a stale state: drop it, then publish the newest one. The
	// consumer may race the drain and read the stale value, which is fine — it
	// will then read this newest value on its next iteration.
	select {
	case <-ready:
	default:
	}
	select {
	case ready <- state:
	default:
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
