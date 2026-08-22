package connector

import "sync"

type Proxy struct {
	mu    sync.RWMutex
	chans map[string]chan []byte
}

func NewProxy() *Proxy { return &Proxy{chans: map[string]chan []byte{}} }

func (p *Proxy) Register(execID string, ch chan []byte) {
	p.mu.Lock()
	p.chans[execID] = ch
	p.mu.Unlock()
}

func (p *Proxy) ForwardResult(execID string, data []byte) {
	p.mu.RLock()
	ch, ok := p.chans[execID]
	p.mu.RUnlock()
	if !ok {
		return
	}
	select {
	case ch <- data:
	default:
	}
}

func (p *Proxy) Unregister(execID string) {
	p.mu.Lock()
	delete(p.chans, execID)
	p.mu.Unlock()
}

// Has reports whether execID is registered.
func (p *Proxy) Has(execID string) bool {
	p.mu.RLock()
	_, ok := p.chans[execID]
	p.mu.RUnlock()
	return ok
}

// OnConnectorDown closes the channel for execID and removes it.
// Safe to call multiple times; double-close is avoided.
func (p *Proxy) OnConnectorDown(execID string) {
	p.mu.Lock()
	ch, ok := p.chans[execID]
	if ok {
		delete(p.chans, execID)
	}
	p.mu.Unlock()
	if ok {
		// close outside lock to avoid blocking
		func() {
			defer func() { _ = recover() }()
			close(ch)
		}()
	}
}
