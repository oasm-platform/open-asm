package worker

import "testing"

func TestPollPolicy_FlowFillsAllSlots(t *testing.T) {
	p := newPollPolicy()

	if !p.flowing() {
		t.Fatal("a fresh policy must be flowing so a backlog is drained at full concurrency")
	}
	if got := p.nextDelay(3); got != pollRefillDelay {
		t.Fatalf("flowing nextDelay = %v, want %v (refill freed slots quickly)", got, pollRefillDelay)
	}
}

func TestPollPolicy_EmptyPollsBackOff(t *testing.T) {
	p := newPollPolicy()
	p.feedback(false)

	if p.flowing() {
		t.Fatal("an empty poll must stop the policy from flowing")
	}
	if got := p.nextDelay(1); got != p.backoff || got <= pollIdleBackoff {
		t.Fatalf("idle nextDelay = %v, want the grown backoff %v", got, p.backoff)
	}

	for range 10 {
		p.feedback(false)
	}
	if p.backoff != pollMaxBackoff {
		t.Fatalf("backoff must cap at %v, got %v", pollMaxBackoff, p.backoff)
	}
}

func TestPollPolicy_JobResetsBackoff(t *testing.T) {
	p := newPollPolicy()
	p.feedback(false)
	p.feedback(false)
	if p.backoff == pollIdleBackoff {
		t.Fatal("precondition: backoff should have grown")
	}

	p.feedback(true)
	if p.backoff != pollIdleBackoff {
		t.Fatalf("finding a job must reset backoff to %v, got %v", pollIdleBackoff, p.backoff)
	}
	if !p.flowing() {
		t.Fatal("finding a job must resume flowing")
	}
}

func TestPollPolicy_BusyReturnsShortDelay(t *testing.T) {
	p := newPollPolicy()
	if got := p.nextDelay(0); got != pollBusyDelay {
		t.Fatalf("nextDelay(0) = %v, want %v (all slots busy)", got, pollBusyDelay)
	}
}
