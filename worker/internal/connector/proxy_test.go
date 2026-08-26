package connector

import "testing"

func TestProxyForwardsResult(t *testing.T) {
	p := NewProxy()
	ch := make(chan []byte, 1)
	p.Register("exec-1", ch)
	p.ForwardResult("exec-1", []byte(`{"ok":true}`))
	if got := <-ch; string(got) != `{"ok":true}` {
		t.Fatalf("forward mismatch: %s", got)
	}
}

func TestProxyDropsUnknownExecution(t *testing.T) {
	p := NewProxy()
	p.ForwardResult("unknown", []byte(`x`))
}

func TestSetErrorAndPopError(t *testing.T) {
	p := NewProxy()

	// Pop on empty returns false.
	if _, ok := p.PopError("exec-x"); ok {
		t.Fatal("PopError on empty should return false")
	}

	// Set then Pop round-trip.
	p.SetError("exec-1", "container failed")
	msg, ok := p.PopError("exec-1")
	if !ok {
		t.Fatal("PopError should return true after SetError")
	}
	if msg != "container failed" {
		t.Fatalf("expected 'container failed', got %q", msg)
	}

	// Second Pop returns false (consumed).
	if _, ok := p.PopError("exec-1"); ok {
		t.Fatal("PopError should return false after first Pop")
	}
}
