package egress

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// RecorderOptions tunes a Recorder; zero values take the defaults.
type RecorderOptions struct {
	Capacity, MaxBatch, MaxBatchBytes int
	// MaxQueuedBytes bounds the memory of queued and in-flight events:
	// Capacity alone allows ~1.3 GB of bodies while core-api is down.
	MaxQueuedBytes int
	Interval       time.Duration
	// Send delivers one batch plus the number of events dropped since the
	// last successful delivery. Wrap errors a resend cannot fix with
	// Permanent, or Unsupported when core-api lacks the endpoint.
	Send   func(ctx context.Context, batch []HTTPEvent, dropped uint64) error
	Logger Logger
}

type permanentError struct {
	err         error
	unsupported bool
}

func (e *permanentError) Error() string { return e.err.Error() }
func (e *permanentError) Unwrap() error { return e.err }

// Permanent marks a Send error a resend cannot fix: the batch is dropped
// without retries.
func Permanent(err error) error { return &permanentError{err: err} }

// Unsupported marks a Send error from a core-api without the endpoint: the
// batch is dropped and recording pauses, so commands stop waiting on logs
// that can never be delivered.
func Unsupported(err error) error { return &permanentError{err: err, unsupported: true} }

// unsupportedCooldown is how long recording stays paused before probing
// core-api again (it may have been upgraded meanwhile).
const unsupportedCooldown = 10 * time.Minute

// Recorder ships HTTPEvents off the proxy path in batches. The queue is
// bounded and Record never blocks, so a slow or unreachable core-api costs
// dropped log rows (counted and reported) instead of slowing agent traffic.
type Recorder struct {
	send      func(ctx context.Context, batch []HTTPEvent, dropped uint64) error
	logger    Logger
	maxBatch  int
	maxBytes  int
	maxQueued int
	interval  time.Duration
	ch        chan HTTPEvent
	nudge     chan struct{}
	dropped   atomic.Uint64
	// pausedUntil is a UnixNano deadline; zero or past means recording.
	pausedUntil atomic.Int64

	// Fields rather than constants so tests need not wait out real backoff.
	retryBase, retryMax, sendTimeout time.Duration
	maxAttempts                      int
	cooldown                         time.Duration
	now                              func() time.Time

	mu      sync.Mutex
	pending map[string]int // run id -> proxied, queued and in-flight events
	queued  int            // eventSize of queued + in-flight events
	settled chan struct{}  // closed and replaced when pending shrinks or an event is queued
}

func NewRecorder(o RecorderOptions) *Recorder {
	if o.Capacity <= 0 {
		o.Capacity = 10000
	}
	if o.MaxBatch <= 0 {
		o.MaxBatch = 200
	}
	if o.MaxBatchBytes <= 0 {
		o.MaxBatchBytes = 1 << 20
	}
	if o.MaxQueuedBytes <= 0 {
		o.MaxQueuedBytes = 64 << 20
	}
	if o.Interval <= 0 {
		o.Interval = time.Second
	}
	return &Recorder{
		send:        o.Send,
		logger:      o.Logger,
		maxBatch:    o.MaxBatch,
		maxBytes:    o.MaxBatchBytes,
		maxQueued:   o.MaxQueuedBytes,
		interval:    o.Interval,
		ch:          make(chan HTTPEvent, o.Capacity),
		nudge:       make(chan struct{}, 1),
		retryBase:   500 * time.Millisecond,
		retryMax:    10 * time.Second,
		sendTimeout: 10 * time.Second,
		maxAttempts: 5,
		cooldown:    unsupportedCooldown,
		now:         time.Now,
		pending:     make(map[string]int),
		settled:     make(chan struct{}),
	}
}

func (r *Recorder) paused() bool {
	return r.now().UnixNano() < r.pausedUntil.Load()
}

// Record queues e without blocking; a full queue or byte budget, or a pause
// after core-api turned out not to support the endpoint, drops it.
func (r *Recorder) Record(e HTTPEvent) {
	r.begin(e.RunID)
	r.commit(e)
}

// begin counts an event of run from the moment its request starts, so
// FlushRun also waits for requests still being proxied. Each begin must be
// matched by exactly one commit.
func (r *Recorder) begin(run string) {
	r.mu.Lock()
	r.pending[run]++
	r.mu.Unlock()
}

func (r *Recorder) commit(e HTTPEvent) {
	if r.paused() {
		r.dropped.Add(1)
		r.settle(e.RunID, 1, 0)
		return
	}
	size := eventSize(e)
	r.mu.Lock()
	if r.queued+size > r.maxQueued {
		r.mu.Unlock()
		r.dropped.Add(1)
		r.settle(e.RunID, 1, 0)
		return
	}
	r.queued += size
	r.mu.Unlock()
	select {
	case r.ch <- e:
		// A FlushRun that nudged while e was still being proxied must nudge
		// again, or e waits for the next tick.
		r.mu.Lock()
		r.signal()
		r.mu.Unlock()
	default:
		r.dropped.Add(1)
		r.settle(e.RunID, 1, size)
	}
}

// signal wakes FlushRun waiters; r.mu must be held.
func (r *Recorder) signal() {
	close(r.settled)
	r.settled = make(chan struct{})
}

func (r *Recorder) settle(run string, n, size int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.queued -= size
	if left := r.pending[run] - n; left > 0 {
		r.pending[run] = left
	} else {
		delete(r.pending, run)
	}
	r.signal()
}

func (r *Recorder) settleBatch(batch []HTTPEvent) {
	type tally struct{ n, size int }
	counts := make(map[string]tally)
	for _, e := range batch {
		t := counts[e.RunID]
		counts[e.RunID] = tally{t.n + 1, t.size + eventSize(e)}
	}
	for s, t := range counts {
		r.settle(s, t.n, t.size)
	}
}

// FlushRun returns once no proxied, queued or in-flight event of run
// remains (delivered or given up on), or when ctx is done.
func (r *Recorder) FlushRun(ctx context.Context, run string) {
	for {
		r.mu.Lock()
		n := r.pending[run]
		ch := r.settled
		r.mu.Unlock()
		if n == 0 {
			return
		}
		select {
		case r.nudge <- struct{}{}:
		default:
		}
		select {
		case <-ch:
		case <-ctx.Done():
			return
		}
	}
}

// Run batches queued events until ctx is done.
func (r *Recorder) Run(ctx context.Context) {
	tick := time.NewTicker(r.interval)
	defer tick.Stop()
	var batch []HTTPEvent
	size := 0
	flush := func() {
		if len(batch) == 0 && r.dropped.Load() == 0 {
			return
		}
		r.deliver(ctx, batch)
		r.settleBatch(batch)
		batch, size = nil, 0
	}
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-r.ch:
			batch = append(batch, e)
			size += eventSize(e)
			if len(batch) >= r.maxBatch || size >= r.maxBytes {
				flush()
			}
		case <-tick.C:
			flush()
		case <-r.nudge:
			// Take what is already queued so the waiting run's events
			// are in this flush, not the next tick's.
			r.drain(&batch, &size, flush)
			flush()
		}
	}
}

func (r *Recorder) drain(batch *[]HTTPEvent, size *int, flush func()) {
	for {
		select {
		case e := <-r.ch:
			*batch = append(*batch, e)
			*size += eventSize(e)
			if len(*batch) >= r.maxBatch || *size >= r.maxBytes {
				flush()
			}
		default:
			return
		}
	}
}

// deliver sends batch with retries; on final failure the batch is counted
// as dropped so core-api still learns rows went missing.
func (r *Recorder) deliver(ctx context.Context, batch []HTTPEvent) {
	if r.paused() {
		r.dropped.Add(uint64(len(batch)))
		return
	}
	dropped := r.dropped.Swap(0)
	backoff := r.retryBase
	var err error
	var perm *permanentError
	for attempt := 1; ; attempt++ {
		sctx, cancel := context.WithTimeout(ctx, r.sendTimeout)
		err = r.send(sctx, batch, dropped)
		cancel()
		if err == nil {
			return
		}
		if errors.As(err, &perm) || attempt >= r.maxAttempts || !sleepCtx(ctx, backoff) {
			break
		}
		backoff = min(backoff*2, r.retryMax)
	}
	if perm != nil && !perm.unsupported {
		// Re-adding the count would resend it every tick in a batch core-api
		// rejects again, forever: these rows are lost for good.
		if r.logger != nil {
			r.logger.Warning("egress http log batch rejected events=%d dropped=%d err=%v", len(batch), dropped, err)
		}
		return
	}
	r.dropped.Add(dropped + uint64(len(batch)))
	if perm != nil {
		r.pausedUntil.Store(r.now().Add(r.cooldown).UnixNano())
		if r.logger != nil {
			r.logger.Warning("core-api does not support ReportEgressHttpLogs; agent HTTP logging paused for %s", strings.TrimSuffix(r.cooldown.String(), "0s"))
		}
		return
	}
	// A batch carrying only the dropped count loses nothing new.
	if r.logger != nil && len(batch) > 0 {
		r.logger.Warning("egress http log batch dropped events=%d err=%v", len(batch), err)
	}
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// eventSize approximates an event's wire size for MaxBatchBytes.
func eventSize(e HTTPEvent) int {
	n := 128 + len(e.ID) + len(e.SessionID) + len(e.Scheme) + len(e.Method) + len(e.Host) +
		len(e.Path) + len(e.Error) + len(e.RequestBody) + len(e.ResponseBody)
	for _, h := range e.RequestHeaders {
		n += len(h.Name) + len(h.Value)
	}
	for _, h := range e.ResponseHeaders {
		n += len(h.Name) + len(h.Value)
	}
	return n
}
