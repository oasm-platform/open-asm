package worker

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// countingPoller returns a startPoller that records starts/stops, so tests can
// assert the exact poller lifecycle.
func countingPoller(starts, stops *atomic.Int32) func(context.Context) context.CancelFunc {
	return func(sessionCtx context.Context) context.CancelFunc {
		starts.Add(1)
		pctx, pcancel := context.WithCancel(sessionCtx)
		go func() {
			<-pctx.Done()
			stops.Add(1)
		}()
		return pcancel
	}
}

// A duplicate connected notification must not tear down the live poller (the
// bug: it cancelled the session — and thus the child poller context — and then
// skipped starting a replacement).
func TestRunReadyConsumer_DuplicateConnectedKeepsSinglePoller(t *testing.T) {
	ready := make(chan bool, 8)
	var starts, stops, onConnected atomic.Int32
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		runReadyConsumer(ctx, ready, readyDeps{
			setup: func(parent context.Context) (context.Context, context.CancelFunc) {
				return context.WithCancel(parent)
			},
			startPoller: countingPoller(&starts, &stops),
			onConnected: func() { onConnected.Add(1) },
		})
		close(done)
	}()

	ready <- true
	waitFor(t, time.Second, func() bool { return starts.Load() == 1 && onConnected.Load() == 1 })

	ready <- true // duplicate
	time.Sleep(20 * time.Millisecond)
	if got := starts.Load(); got != 1 {
		t.Fatalf("duplicate connected started %d pollers, want 1", got)
	}
	if got := stops.Load(); got != 0 {
		t.Fatalf("duplicate connected stopped the poller %d times, want 0", got)
	}
	if got := onConnected.Load(); got != 1 {
		t.Fatalf("duplicate connected fired onConnected %d times, want 1", got)
	}

	cancel()
	<-done
}

// A real reconnect (false then true) must (re)start the poller while reusing the
// session, so in-flight jobs keep a live context.
func TestRunReadyConsumer_ReconnectRestartsPollerAndReusesSession(t *testing.T) {
	ready := make(chan bool, 8)
	var setups, starts, stops atomic.Int32
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		runReadyConsumer(ctx, ready, readyDeps{
			setup: func(parent context.Context) (context.Context, context.CancelFunc) {
				setups.Add(1)
				return context.WithCancel(parent)
			},
			startPoller: countingPoller(&starts, &stops),
		})
		close(done)
	}()

	ready <- true
	waitFor(t, time.Second, func() bool { return starts.Load() == 1 })

	ready <- false
	waitFor(t, time.Second, func() bool { return stops.Load() == 1 })

	ready <- true
	waitFor(t, time.Second, func() bool { return starts.Load() == 2 })
	if got := setups.Load(); got != 1 {
		t.Fatalf("setup ran %d times, want 1 (session must be reused across reconnects)", got)
	}

	cancel()
	<-done
}

// A failed setup must not start a poller, and a later connected notification
// must retry setup instead of being treated as a duplicate.
func TestRunReadyConsumer_SetupFailureStaysDisconnectedAndRetries(t *testing.T) {
	ready := make(chan bool, 8)
	var setups, starts, stops atomic.Int32
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		runReadyConsumer(ctx, ready, readyDeps{
			setup: func(parent context.Context) (context.Context, context.CancelFunc) {
				if setups.Add(1) == 1 {
					return nil, nil // first attempt fails
				}
				return context.WithCancel(parent)
			},
			startPoller: countingPoller(&starts, &stops),
		})
		close(done)
	}()

	ready <- true
	waitFor(t, time.Second, func() bool { return setups.Load() == 1 })
	time.Sleep(20 * time.Millisecond)
	if got := starts.Load(); got != 0 {
		t.Fatalf("poller started after failed setup: %d", got)
	}

	ready <- true
	waitFor(t, time.Second, func() bool { return starts.Load() == 1 })
	if got := setups.Load(); got != 2 {
		t.Fatalf("setup ran %d times, want 2 (retry after failure)", got)
	}

	cancel()
	<-done
}

// Shutting down must stop the poller exactly once.
func TestRunReadyConsumer_ContextCancelStopsPoller(t *testing.T) {
	ready := make(chan bool, 8)
	var starts, stops atomic.Int32
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		runReadyConsumer(ctx, ready, readyDeps{
			setup: func(parent context.Context) (context.Context, context.CancelFunc) {
				return context.WithCancel(parent)
			},
			startPoller: countingPoller(&starts, &stops),
		})
		close(done)
	}()

	ready <- true
	waitFor(t, time.Second, func() bool { return starts.Load() == 1 })

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("runReadyConsumer did not return after ctx cancel")
	}
	// The poller's cancel func is invoked synchronously, but the counting
	// goroutine that observes it may be scheduled a moment later.
	waitFor(t, time.Second, func() bool { return stops.Load() == 1 })
}
