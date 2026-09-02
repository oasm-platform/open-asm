package connector

import "sync"

type Proxy struct {
	mu     sync.RWMutex
	chans  map[string]chan []byte
	errors map[string]string
	done   map[string]bool
}

func NewProxy() *Proxy {
	return &Proxy{chans: map[string]chan []byte{}, errors: map[string]string{}, done: map[string]bool{}}
}

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

// SetError stores an error message for an execution, set by the Done message.
func (p *Proxy) SetError(execID, errMsg string) {
	p.mu.Lock()
	p.errors[execID] = errMsg
	p.mu.Unlock()
}

// PopError retrieves and removes the error for an execution.
// Returns ("", false) if no error was recorded.
func (p *Proxy) PopError(execID string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	msg, ok := p.errors[execID]
	if ok {
		delete(p.errors, execID)
	}
	return msg, ok
}

// MarkDone records that the connector sent a clean Done message for execID.
func (p *Proxy) MarkDone(execID string) {
	p.mu.Lock()
	p.done[execID] = true
	p.mu.Unlock()
}

// PopDone reports and clears whether Done was received for execID.
func (p *Proxy) PopDone(execID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	ok := p.done[execID]
	if ok {
		delete(p.done, execID)
	}
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
