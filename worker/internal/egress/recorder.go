package egress

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

// RecorderOptions tunes a Recorder; zero values take the defaults.
type RecorderOptions struct {
	Capacity, MaxBatch, MaxBatchBytes int
	Interval                          time.Duration
	// Send delivers one batch plus the number of events dropped since the
	// last successful delivery.
	Send   func(ctx context.Context, batch []HTTPEvent, dropped uint64) error
	Logger Logger
}

// Recorder ships HTTPEvents off the proxy path in batches. The queue is
// bounded and Record never blocks, so a slow or unreachable core-api costs
// dropped log rows (counted and reported) instead of slowing agent traffic.
type Recorder struct {
	send     func(ctx context.Context, batch []HTTPEvent, dropped uint64) error
	logger   Logger
	maxBatch int
	maxBytes int
	interval time.Duration
	ch       chan HTTPEvent
	dropped  atomic.Uint64

	// Fields rather than constants so tests need not wait out real backoff.
	retryBase, retryMax, sendTimeout time.Duration
	maxAttempts                      int

	mu      sync.Mutex
	pending map[string]int // session -> queued + in-flight events
	settled chan struct{}  // closed and replaced whenever pending shrinks
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
	if o.Interval <= 0 {
		o.Interval = time.Second
	}
	return &Recorder{
		send:        o.Send,
		logger:      o.Logger,
		maxBatch:    o.MaxBatch,
		maxBytes:    o.MaxBatchBytes,
		interval:    o.Interval,
		ch:          make(chan HTTPEvent, o.Capacity),
		retryBase:   500 * time.Millisecond,
		retryMax:    10 * time.Second,
		sendTimeout: 10 * time.Second,
		maxAttempts: 5,
		pending:     make(map[string]int),
		settled:     make(chan struct{}),
	}
}

// Record queues e without blocking; a full queue drops it.
func (r *Recorder) Record(e HTTPEvent) {
	// Counted before the send so FlushSession can never miss an event that
	// is already in the channel.
	r.mu.Lock()
	r.pending[e.SessionID]++
	r.mu.Unlock()
	select {
	case r.ch <- e:
	default:
		r.dropped.Add(1)
		r.settle(e.SessionID, 1)
	}
}

func (r *Recorder) settle(session string, n int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if left := r.pending[session] - n; left > 0 {
		r.pending[session] = left
	} else {
		delete(r.pending, session)
	}
	close(r.settled)
	r.settled = make(chan struct{})
}

func (r *Recorder) settleBatch(batch []HTTPEvent) {
	counts := make(map[string]int)
	for _, e := range batch {
		counts[e.SessionID]++
	}
	for s, n := range counts {
		r.settle(s, n)
	}
}

// FlushSession returns once no queued or in-flight event of sessionID
// remains (delivered or given up on), or when ctx is done.
func (r *Recorder) FlushSession(ctx context.Context, sessionID string) {
	for {
		r.mu.Lock()
		n := r.pending[sessionID]
		ch := r.settled
		r.mu.Unlock()
		if n == 0 {
			return
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
		}
	}
}

// deliver sends batch with retries; on final failure the batch is counted
// as dropped so core-api still learns rows went missing.
func (r *Recorder) deliver(ctx context.Context, batch []HTTPEvent) {
	dropped := r.dropped.Swap(0)
	backoff := r.retryBase
	var err error
	for attempt := 1; ; attempt++ {
		sctx, cancel := context.WithTimeout(ctx, r.sendTimeout)
		err = r.send(sctx, batch, dropped)
		cancel()
		if err == nil {
			return
		}
		if attempt >= r.maxAttempts || !sleepCtx(ctx, backoff) {
			break
		}
		backoff = min(backoff*2, r.retryMax)
	}
	r.dropped.Add(dropped + uint64(len(batch)))
	if r.logger != nil {
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
