package transport

import (
	"context"
	"math"
	"time"
)

// Backoff provides exponential backoff with cap.
// ponytail: stateless — Next recalculates from attempt, Reset is no-op; no jitter needed now.
type Backoff struct {
	base, max time.Duration
}

// NewBackoff creates a Backoff with base and max duration.
func NewBackoff(base, max time.Duration) *Backoff { return &Backoff{base: base, max: max} }

// Next returns duration for attempt (1-indexed): base * 2^(attempt-1), capped at max.
func (b *Backoff) Next(attempt int) time.Duration {
	d := time.Duration(float64(b.base) * math.Pow(2, float64(attempt-1)))
	if d > b.max {
		return b.max
	}
	return d
}

// Reset is no-op since Next recalculates from attempt number (stateless).
func (b *Backoff) Reset() {}

// redialFloor is the minimum wait between consecutive successful dials.
// Prevents a hot-spin tight loop when the stream closes cleanly and dial
// keeps succeeding instantly (e.g. server accepting but stream dying).
const redialFloor = 1 * time.Second

// ReconnectLoop retries dial with exponential backoff until ctx cancelled.
// On dial success, attempt resets to 1. On dial error, backs off then retries.
// Returns ctx.Err() when context cancelled.
func ReconnectLoop(ctx context.Context, dial func() error, base, max time.Duration) error {
	return ReconnectLoopWithResume(ctx, dial, nil, base, max)
}

// ReconnectLoopWithResume is like ReconnectLoop but calls onReconnect after each successful dial.
// ponytail: onReconnect is where caller resends Register + ReadyForWork to resume the bidi stream.
func ReconnectLoopWithResume(ctx context.Context, dial func() error, onReconnect func(), base, max time.Duration) error {
	bo := NewBackoff(base, max)
	attempt := 1
	for {
		// Check ctx before dial to avoid extra attempt after cancel.
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		err := dial()
		if err == nil {
			if onReconnect != nil {
				onReconnect()
			}
			attempt = 1
			// Floor delay after a successful dial so a clean-close cycle
			// does not spin at 100% CPU hammering Core with redials.
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(redialFloor):
			}
			continue
		}
		// If dial returned context.Canceled and ctx is done, return ctx.Err().
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(bo.Next(attempt)):
			attempt++
		}
	}
}
