package connector

import "testing"

func TestConnectorDownTriggersCleanup(t *testing.T) {
	p := NewProxy()
	ch := make(chan ResultMsg, 1)
	p.Register("exec-1", ch)
	p.OnConnectorDown("exec-1")
	// channel should be closed; reading it yields ok==false
	_, ok := <-ch
	if ok {
		t.Fatal("channel should be closed on down")
	}
	// proxy should no longer hold the execution
	if p.Has("exec-1") {
		t.Fatal("proxy should not retain exec after down")
	}
	// must not panic on unknown exec
	p.OnConnectorDown("unknown")
}

func TestProxyUnregistersOnDisconnect(t *testing.T) {
	p := NewProxy()
	ch := make(chan ResultMsg, 1)
	p.Register("exec-2", ch)
	p.Unregister("exec-2")
	if p.Has("exec-2") {
		t.Fatal("expected unregistered")
	}
	p.ForwardResult("exec-2", []byte(`x`), nil) // should not panic or block
}

func TestOnConnectorDownClosesExactlyOnce(t *testing.T) {
	p := NewProxy()
	ch := make(chan ResultMsg, 1)
	p.Register("exec-3", ch)
	p.OnConnectorDown("exec-3")
	p.OnConnectorDown("exec-3") // second call must not panic (double close guard)
}
