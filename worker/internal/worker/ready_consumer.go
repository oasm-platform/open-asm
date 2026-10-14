package worker

import "context"

// readyDeps are the side effects runReadyConsumer drives. They are injected so
// the connection→poller lifecycle is unit-testable without a live gRPC server.
type readyDeps struct {
	// setup creates the session for a new connection and runs its one-time
	// wiring (network join, tool download, remote-execute handler). It returns
	// the session context and its cancel func, or (nil, nil) on failure — the
	// consumer then stays disconnected and retries on the next connected
	// notification.
	setup func(ctx context.Context) (context.Context, context.CancelFunc)
	// startPoller starts the job poll loop for sessionCtx and returns its
	// cancel func. Called exactly once per real connected transition.
	startPoller func(sessionCtx context.Context) context.CancelFunc
	// onConnected / onDisconnected fire on real transitions only.
	onConnected    func()
	onDisconnected func()
}

// Connection states. The distinct "unknown" initial value lets the first
// notification always fire its side effects — matching the previous behaviour
// where a failed first join surfaced a disconnect.
const (
	stateUnknown = iota
	stateConnected
	stateDisconnected
)

// runReadyConsumer consumes connection-state notifications from Connect until
// ctx is done (or ready closes), driving the session + job-poller lifecycle.
//
// Why this exists: the job poller's context is a child of the session context,
// so every reconnect that replaces the session also kills the poller. The old
// code then refused to start a replacement because it still held the dead
// poller's cancel func ("Poller already running, skipping duplicate start"),
// and a duplicate or stale `true` could cancel a healthy session. Either way a
// connected worker was left with no poller: it reported itself online (telemetry
// runs independently of polling) and kept its in-flight job, but never pulled
// another job — the pending job sat in the registry forever.
//
// The state machine here makes that impossible:
//   - duplicate notifications are ignored (idempotent);
//   - every real connected transition (re)starts exactly one poller;
//   - a disconnect stops the poller but leaves the session alive so in-flight
//     jobs can still report their results;
//   - a failed setup leaves the consumer disconnected so the next `true`
//     retries.
func runReadyConsumer(ctx context.Context, ready <-chan bool, deps readyDeps) {
	var (
		state         = stateUnknown
		sessionCtx    context.Context
		sessionCancel context.CancelFunc
		pollerCancel  context.CancelFunc
	)
	stopPoller := func() {
		if pollerCancel != nil {
			pollerCancel()
			pollerCancel = nil
		}
	}
	closeSession := func() {
		if sessionCancel != nil {
			sessionCancel()
			sessionCancel = nil
		}
		sessionCtx = nil
	}

	for {
		select {
		case <-ctx.Done():
			stopPoller()
			closeSession()
			return
		case isConnected, ok := <-ready:
			if !ok {
				stopPoller()
				closeSession()
				return
			}

			want := stateDisconnected
			if isConnected {
				want = stateConnected
			}
			if want == state {
				// Redundant notification: a duplicate `true` must not tear down a
				// live session/poller, and a duplicate `false` must not stop an
				// already-stopped poller.
				continue
			}
			state = want

			if !isConnected {
				stopPoller()
				if deps.onDisconnected != nil {
					deps.onDisconnected()
				}
				continue
			}

			// Connecting: build the session once and reuse it across reconnects
			// so in-flight jobs keep a live context to submit results with.
			if sessionCtx == nil {
				if deps.setup == nil {
					continue
				}
				sctx, cancel := deps.setup(ctx)
				if sctx == nil {
					// Setup failed — stay disconnected so a later notification
					// retries instead of being treated as a duplicate.
					state = stateDisconnected
					continue
				}
				sessionCtx, sessionCancel = sctx, cancel
			}

			stopPoller()
			if deps.startPoller != nil {
				pollerCancel = deps.startPoller(sessionCtx)
			}
			if deps.onConnected != nil {
				deps.onConnected()
			}
		}
	}
}
