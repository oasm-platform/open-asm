package worker

import "time"

const (
	// pollIdleBackoff is the starting wait between empty polls.
	pollIdleBackoff = time.Second
	// pollMaxBackoff caps the idle backoff.
	pollMaxBackoff = 5 * time.Second
	// pollRefillDelay is the short wait before refilling freed slots while jobs
	// are flowing.
	pollRefillDelay = 100 * time.Millisecond
	// pollBusyDelay is the retry delay when every concurrency slot is busy.
	pollBusyDelay = 200 * time.Millisecond
)

// pollPolicy owns the adaptive cadence of the job poller.
//
// The poller must fill ALL free concurrency slots each cycle: dispatching a
// single job per backoff tick left the configured concurrency mostly idle while
// jobs sat pending in the registry (short jobs finishing in ~1s ran ~1–2
// concurrent out of 12). While jobs are flowing the policy polls again quickly
// to refill freed slots; once polls come back empty it backs off so an idle
// worker does not hammer Core, and it then probes with a single dispatch instead
// of a burst.
type pollPolicy struct {
	backoff time.Duration
}

func newPollPolicy() *pollPolicy {
	return &pollPolicy{backoff: pollIdleBackoff}
}

// feedback records whether a just-finished poll found a job.
func (p *pollPolicy) feedback(foundJob bool) {
	if foundJob {
		p.backoff = pollIdleBackoff
		return
	}
	p.backoff *= 2
	if p.backoff > pollMaxBackoff {
		p.backoff = pollMaxBackoff
	}
}

// flowing reports whether jobs were recently found, i.e. the poller should fill
// every free slot rather than probing with a single dispatch.
func (p *pollPolicy) flowing() bool {
	return p.backoff <= pollIdleBackoff
}

// maxDispatch caps how many jobs one cycle may dispatch. When idle it probes
// with a single pull so an empty queue is not hit by a burst of N calls.
func (p *pollPolicy) maxDispatch(concurrency int) int {
	if !p.flowing() {
		return 1
	}
	if concurrency < 1 {
		return 1
	}
	return concurrency
}

// nextDelay returns how long to wait before the next cycle.
func (p *pollPolicy) nextDelay(dispatched int) time.Duration {
	if dispatched == 0 {
		return pollBusyDelay // every slot is busy
	}
	if p.flowing() {
		return pollRefillDelay // refill freed slots quickly
	}
	return p.backoff // idle: back off
}
