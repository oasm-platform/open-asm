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
