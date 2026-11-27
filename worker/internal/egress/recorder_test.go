package egress

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type sendCall struct {
	batch   []HTTPEvent
	dropped uint64
}

func TestRecorderDropsWhenFull(t *testing.T) {
	entered := make(chan struct{}, 1)
	release := make(chan struct{})
	calls := make(chan sendCall, 8)
	var once sync.Once
	r := NewRecorder(RecorderOptions{
		Capacity: 2,
		MaxBatch: 1,
		Interval: 10 * time.Millisecond,
		Send: func(_ context.Context, batch []HTTPEvent, dropped uint64) error {
			once.Do(func() {
				entered <- struct{}{}
				<-release
			})
			calls <- sendCall{batch, dropped}
			return nil
		},
	})
	go r.Run(t.Context())

	r.Record(HTTPEvent{ID: "e0", SessionID: "s"})
	<-entered // Send holds e0; the queue is now empty with capacity 2.
	r.Record(HTTPEvent{ID: "e1", SessionID: "s"})
	r.Record(HTTPEvent{ID: "e2", SessionID: "s"})
	start := time.Now()
	r.Record(HTTPEvent{ID: "e3", SessionID: "s"})
	if d := time.Since(start); d > 50*time.Millisecond {
		t.Fatalf("Record on a full queue blocked for %v", d)
	}
	close(release)

	var dropped uint64
	var ids []string
	for len(ids) < 3 {
		select {
		case c := <-calls:
			dropped += c.dropped
			for _, e := range c.batch {
				ids = append(ids, e.ID)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("got only %v", ids)
		}
	}
	if dropped != 1 {
		t.Fatalf("dropped reported = %d, want 1", dropped)
	}
	if ids[0] != "e0" || ids[1] != "e1" || ids[2] != "e2" {
		t.Fatalf("sent ids = %v", ids)
	}
}

func TestRecorderBatchesBySize(t *testing.T) {
	calls := make(chan sendCall, 8)
	r := NewRecorder(RecorderOptions{
		MaxBatch: 2,
		Interval: time.Hour,
		Send: func(_ context.Context, batch []HTTPEvent, dropped uint64) error {
			calls <- sendCall{batch, dropped}
			return nil
		},
	})
	for i := range 4 {
		r.Record(HTTPEvent{ID: string(rune('a' + i)), SessionID: "s"})
	}
	go r.Run(t.Context())
	for i := range 2 {
		select {
		case c := <-calls:
			if len(c.batch) != 2 {
				t.Fatalf("batch %d size = %d, want 2", i, len(c.batch))
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("batch %d never sent", i)
		}
	}
}

func TestRecorderBatchesByBytes(t *testing.T) {
	calls := make(chan sendCall, 8)
	body := make([]byte, 1000)
	r := NewRecorder(RecorderOptions{
		MaxBatchBytes: 2 * eventSize(HTTPEvent{ID: "a", SessionID: "s", RequestBody: body}),
		Interval:      time.Hour,
		Send: func(_ context.Context, batch []HTTPEvent, dropped uint64) error {
			calls <- sendCall{batch, dropped}
			return nil
		},
	})
	for i := range 4 {
		r.Record(HTTPEvent{ID: string(rune('a' + i)), SessionID: "s", RequestBody: body})
	}
	go r.Run(t.Context())
	for i := range 2 {
		select {
		case c := <-calls:
			if len(c.batch) != 2 {
				t.Fatalf("batch %d size = %d, want 2", i, len(c.batch))
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("batch %d never sent", i)
		}
	}
}

func TestRecorderDropsOverByteBudget(t *testing.T) {
	body := make([]byte, 1000)
	ev := func(id string) HTTPEvent { return HTTPEvent{ID: id, SessionID: "s", RequestBody: body} }
	entered := make(chan struct{}, 1)
	release := make(chan struct{})
	calls := make(chan sendCall, 8)
	var once sync.Once
	r := NewRecorder(RecorderOptions{
		MaxBatch: 1,
		// Room for two events: the one held by Send and one queued.
		MaxQueuedBytes: 2*eventSize(ev("e0")) + 10,
		Interval:       10 * time.Millisecond,
		Send: func(_ context.Context, batch []HTTPEvent, dropped uint64) error {
			once.Do(func() {
				entered <- struct{}{}
				<-release
			})
			calls <- sendCall{batch, dropped}
			return nil
		},
	})
	go r.Run(t.Context())

	r.Record(ev("e0"))
	<-entered // e0 is in flight and still counts against the budget.
	r.Record(ev("e1"))
	r.Record(ev("e2"))
	r.Record(ev("e3"))

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	close(release)
	r.FlushSession(ctx, "s")
	if ctx.Err() != nil {
		t.Fatal("FlushSession hung on events dropped over the byte budget")
	}

	var dropped uint64
	var ids []string
	for len(ids) < 2 || dropped < 2 {
		select {
		case c := <-calls:
			dropped += c.dropped
			for _, e := range c.batch {
				ids = append(ids, e.ID)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("got ids %v dropped %d", ids, dropped)
		}
	}
	if dropped != 2 || len(ids) != 2 || ids[0] != "e0" || ids[1] != "e1" {
		t.Fatalf("ids = %v dropped = %d, want [e0 e1] and 2", ids, dropped)
	}

	// Delivered events release their budget.
	r.Record(ev("e4"))
	select {
	case c := <-calls:
		if len(c.batch) != 1 || c.batch[0].ID != "e4" {
			t.Fatalf("after drain got %+v", c)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("budget was not released after delivery")
	}
}

func TestRecorderRetriesThenSucceeds(t *testing.T) {
	var mu sync.Mutex
	attempts := 0
	sent := make(chan []HTTPEvent, 1)
	r := NewRecorder(RecorderOptions{
		Interval: 10 * time.Millisecond,
		Send: func(ctx context.Context, batch []HTTPEvent, _ uint64) error {
			if _, ok := ctx.Deadline(); !ok {
				t.Error("Send must get a deadline")
			}
			mu.Lock()
			defer mu.Unlock()
			attempts++
			if attempts < 3 {
				return errors.New("core down")
			}
			sent <- batch
			return nil
		},
	})
	r.retryBase, r.retryMax = time.Millisecond, 5*time.Millisecond
	go r.Run(t.Context())
	r.Record(HTTPEvent{ID: "x", SessionID: "s"})
	select {
	case b := <-sent:
		if len(b) != 1 || b[0].ID != "x" {
			t.Fatalf("retried batch = %+v", b)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("batch never delivered")
	}
	mu.Lock()
	defer mu.Unlock()
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestRecorderGivesUpAndCountsDropped(t *testing.T) {
	calls := make(chan sendCall, 16)
	fail := true
	var mu sync.Mutex
	r := NewRecorder(RecorderOptions{
		Interval: 10 * time.Millisecond,
		Send: func(_ context.Context, batch []HTTPEvent, dropped uint64) error {
			mu.Lock()
			defer mu.Unlock()
			if fail {
				return errors.New("core down")
			}
			calls <- sendCall{batch, dropped}
			return nil
		},
	})
	r.retryBase, r.retryMax = time.Millisecond, time.Millisecond
	go r.Run(t.Context())
	r.Record(HTTPEvent{ID: "a", SessionID: "s"})
	r.Record(HTTPEvent{ID: "b", SessionID: "s"})
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	r.FlushSession(ctx, "s")
	if ctx.Err() != nil {
		t.Fatal("a batch dropped after max attempts must settle FlushSession")
	}
	mu.Lock()
	fail = false
	mu.Unlock()
	select {
	case c := <-calls:
		if c.dropped != 2 {
			t.Fatalf("dropped = %d, want 2", c.dropped)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("dropped count never reported")
	}
}

func TestRecorderFlushSession(t *testing.T) {
	var mu sync.Mutex
	var sent []string
	r := NewRecorder(RecorderOptions{
		Interval: 20 * time.Millisecond,
		Send: func(_ context.Context, batch []HTTPEvent, _ uint64) error {
			mu.Lock()
			defer mu.Unlock()
			for _, e := range batch {
				sent = append(sent, e.ID)
			}
			return nil
		},
	})
	go r.Run(t.Context())
	r.Record(HTTPEvent{ID: "a", SessionID: "s1"})
	r.Record(HTTPEvent{ID: "b", SessionID: "s1"})
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	r.FlushSession(ctx, "s1")
	if ctx.Err() != nil {
		t.Fatal("FlushSession waited until the deadline")
	}
	mu.Lock()
	if len(sent) != 2 {
		t.Fatalf("FlushSession returned before the session's events were sent: %v", sent)
	}
	mu.Unlock()

	// A session with nothing pending returns at once.
	start := time.Now()
	r.FlushSession(ctx, "other")
	if time.Since(start) > 50*time.Millisecond {
		t.Fatal("FlushSession of an idle session must return immediately")
	}

	failing := NewRecorder(RecorderOptions{
		Interval: 10 * time.Millisecond,
		Send:     func(context.Context, []HTTPEvent, uint64) error { return errors.New("down") },
	})
	go failing.Run(t.Context())
	failing.Record(HTTPEvent{ID: "z", SessionID: "s2"})
	short, cancelShort := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancelShort()
	start = time.Now()
	failing.FlushSession(short, "s2")
	if d := time.Since(start); d < 90*time.Millisecond || d > 2*time.Second {
		t.Fatalf("FlushSession with failing Send returned after %v, want ~100ms", d)
	}
}

type warnLog struct {
	mu    sync.Mutex
	warns []string
}

func (l *warnLog) Info(string, ...any) {}
func (l *warnLog) Warning(msg string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.warns = append(l.warns, fmt.Sprintf(msg, args...))
}

func (l *warnLog) count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.warns)
}

func TestRecorderPermanentErrorDropsWithoutRetry(t *testing.T) {
	var attempts atomic.Int32
	r := NewRecorder(RecorderOptions{
		Interval: time.Hour,
		Send: func(context.Context, []HTTPEvent, uint64) error {
			attempts.Add(1)
			return Permanent(errors.New("permission denied"))
		},
	})
	go r.Run(t.Context())
	r.Record(HTTPEvent{ID: "a", SessionID: "s"})
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	start := time.Now()
	r.FlushSession(ctx, "s")
	// The default 500 ms backoff would show here had it retried.
	if d := time.Since(start); d > 300*time.Millisecond {
		t.Fatalf("FlushSession took %v on a permanent error", d)
	}
	if n := attempts.Load(); n != 1 {
		t.Fatalf("send attempts = %d, want 1", n)
	}
	if n := r.dropped.Load(); n != 1 {
		t.Fatalf("dropped = %d, want 1", n)
	}
}

func TestRecorderUnsupportedPausesRecording(t *testing.T) {
	var mu sync.Mutex
	now := time.Date(2026, 11, 27, 10, 0, 0, 0, time.UTC)
	unsupported := true
	var attempts atomic.Int32
	sent := make(chan sendCall, 4)
	log := &warnLog{}
	r := NewRecorder(RecorderOptions{
		Interval: time.Hour,
		Logger:   log,
		Send: func(_ context.Context, batch []HTTPEvent, dropped uint64) error {
			attempts.Add(1)
			mu.Lock()
			defer mu.Unlock()
			if unsupported {
				return Unsupported(errors.New("unimplemented"))
			}
			sent <- sendCall{batch, dropped}
			return nil
		},
	})
	r.now = func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return now
	}
	go r.Run(t.Context())

	r.Record(HTTPEvent{ID: "a", SessionID: "s"})
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	r.FlushSession(ctx, "s")
	if ctx.Err() != nil {
		t.Fatal("FlushSession hung on an unsupported endpoint")
	}

	// Paused: nothing queues, so the flush wait is free.
	for _, id := range []string{"b", "c", "d"} {
		r.Record(HTTPEvent{ID: id, SessionID: "s"})
		r.mu.Lock()
		n := r.pending["s"]
		r.mu.Unlock()
		if n != 0 {
			t.Fatalf("event %s queued while paused", id)
		}
		start := time.Now()
		r.FlushSession(ctx, "s")
		if d := time.Since(start); d > 50*time.Millisecond {
			t.Fatalf("FlushSession while paused took %v", d)
		}
	}
	if n := attempts.Load(); n != 1 {
		t.Fatalf("send attempts = %d, want 1", n)
	}
	if n := log.count(); n != 1 {
		t.Fatalf("warnings = %v, want exactly one", log.warns)
	}

	mu.Lock()
	now = now.Add(10*time.Minute + time.Second)
	unsupported = false
	mu.Unlock()
	r.Record(HTTPEvent{ID: "e", SessionID: "s"})
	r.FlushSession(ctx, "s")
	select {
	case c := <-sent:
		if len(c.batch) != 1 || c.batch[0].ID != "e" || c.dropped != 4 {
			t.Fatalf("after cooldown got ids=%d dropped=%d", len(c.batch), c.dropped)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("recording did not resume after the cooldown")
	}
}

func TestRecorderFlushSessionDoesNotWaitForTick(t *testing.T) {
	r := NewRecorder(RecorderOptions{
		Interval: time.Hour,
		Send:     func(context.Context, []HTTPEvent, uint64) error { return nil },
	})
	go r.Run(t.Context())
	r.Record(HTTPEvent{ID: "a", SessionID: "s"})
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	start := time.Now()
	r.FlushSession(ctx, "s")
	if d := time.Since(start); d > 500*time.Millisecond {
		t.Fatalf("FlushSession took %v, want an immediate flush", d)
	}
}
