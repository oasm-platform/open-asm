package execution

import (
	"sync"
	"time"
)

// ImageBackoff gates container-launch attempts per image: consecutive failures
// push the next allowed start time out exponentially, so a broken image stops
// wasting the worker's container slots and the log stream on every retry.
// In-memory only by design — a worker restart resets all counters (documented
// trade-off: no cross-restart stickiness).
type ImageBackoff struct {
	mu   sync.Mutex
	now  func() time.Time // injectable clock (tests)
	base time.Duration    // first failure window multiplier base
	max  time.Duration    // hard cap per image
	m    map[string]*imageBackoffEntry
}

// imageBackoffEntry tracks one image's consecutive-failure history.
type imageBackoffEntry struct {
	consecutiveFails int
	nextAllowedAt    time.Time
}

// DefaultImageBackoffBase is the base window: min(base*2^fails, max).
const (
	DefaultImageBackoffBase = 30 * time.Second
	DefaultImageBackoffMax  = 10 * time.Minute
)

// NewImageBackoff creates a backoff with the default schedule
// (min(30s*2^fails, 10m)). No jitter: deterministic schedule keeps retry
// windows predictable and testable; add jitter when thundering-herd retries
// become a real concern.
func NewImageBackoff() *ImageBackoff {
	return &ImageBackoff{
		now:  time.Now,
		base: DefaultImageBackoffBase,
		max:  DefaultImageBackoffMax,
		m:    map[string]*imageBackoffEntry{},
	}
}

// newImageBackoffWithClock creates a backoff with an injected clock (tests).
func newImageBackoffWithClock(now func() time.Time) *ImageBackoff {
	b := NewImageBackoff()
	b.now = now
	return b
}

// Allow reports whether a job for image may start now. ok=false means the
// image is backing off; retryIn is the remaining time until the next attempt
// is allowed.
func (b *ImageBackoff) Allow(image string) (ok bool, retryIn time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()
	e := b.m[image]
	if e == nil || e.consecutiveFails == 0 {
		return true, 0
	}
	now := b.now()
	if now.Before(e.nextAllowedAt) {
		return false, e.nextAllowedAt.Sub(now)
	}
	return true, 0
}

// RecordFailure increments the consecutive-failure counter and extends the
// next-allowed time by min(base*2^fails, max) from now.
func (b *ImageBackoff) RecordFailure(image string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	e := b.m[image]
	if e == nil {
		e = &imageBackoffEntry{}
		b.m[image] = e
	}
	e.consecutiveFails++
	// Exponential with overflow guard: min(base*2^fails, max), never past max.
	delay := b.base
	for i := 0; i < e.consecutiveFails && delay < b.max; i++ {
		delay *= 2
	}
	if delay > b.max {
		delay = b.max
	}
	e.nextAllowedAt = b.now().Add(delay)
}

// RecordSuccess resets the image's failure history: the next failure starts
// again from the base delay and Allow returns true immediately.
func (b *ImageBackoff) RecordSuccess(image string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.m, image)
}
