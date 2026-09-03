package connector

import (
	"sync"

	pb "oasm-worker/internal/gen/connector"
)

type Proxy struct {
	mu     sync.RWMutex
	chans  map[string]chan []byte
	errors map[string]string
	done   map[string]bool
	// streams maps execID → live connector bidi stream for ExecuteJob delivery.
	streams map[string]pb.ConnectorService_ConnectServer
	// pendings holds ExecuteJobs queued before the connector's stream arrived
	// (container boot race). Flushed on RegisterConnector.
	pendings map[string]*pb.ExecuteJob
	logger   Logger
}

// Logger receives connector protocol lifecycle log lines (execute sent/queued/
// flushed). TuiLogger (worker package) satisfies it structurally.
// A nil logger disables logging (safe).
type Logger interface {
	Info(msg string, args ...any)
	Warning(msg string, args ...any)
}

// SetLogger wires a protocol lifecycle logger. Nil disables logging (safe).
func (p *Proxy) SetLogger(l Logger) {
	p.logger = l
}

func (p *Proxy) logInfo(msg string, args ...any) {
	if p.logger != nil {
		p.logger.Info(msg, args...)
	}
}

func (p *Proxy) logWarning(msg string, args ...any) {
	if p.logger != nil {
		p.logger.Warning(msg, args...)
	}
}

func NewProxy() *Proxy {
	return &Proxy{
		chans:    map[string]chan []byte{},
		errors:   map[string]string{},
		done:     map[string]bool{},
		streams:  map[string]pb.ConnectorService_ConnectServer{},
		pendings: map[string]*pb.ExecuteJob{},
	}
}

// RegisterConnector stores the live bidi stream for execID and flushes any
// ExecuteJob that was queued before the connector connected. Empty execID
// (legacy connectors that only send Register{token}) is ignored.
func (p *Proxy) RegisterConnector(execID string, stream pb.ConnectorService_ConnectServer) error {
	if execID == "" || stream == nil {
		return nil
	}
	p.mu.Lock()
	pending, hasPending := p.pendings[execID]
	if hasPending {
		delete(p.pendings, execID)
	}
	p.streams[execID] = stream
	p.mu.Unlock()

	if hasPending {
		// Send outside the lock — a stalled connector must not block the proxy.
		if err := stream.Send(&pb.WorkerMessage{Message: &pb.WorkerMessage_Execute{Execute: pending}}); err != nil {
			return err
		}
		p.logInfo("connector execute flushed: exec=%s job=%s", execID, pending.GetJobId())
	}
	return nil
}

// UnregisterConnector removes the stream for execID. It does not touch the
// result channel — OnConnectorDown owns that (avoids double close).
func (p *Proxy) UnregisterConnector(execID string) {
	if execID == "" {
		return
	}
	p.mu.Lock()
	delete(p.streams, execID)
	p.mu.Unlock()
}

// SendExecute delivers job to the connector stream for execID, or queues it as
// pending until the connector registers. Safe to call before the connector
// connects (container boot race). Returns an error only when an immediate send
// to a live stream fails.
func (p *Proxy) SendExecute(execID string, job *pb.ExecuteJob) error {
	if execID == "" || job == nil {
		return nil
	}
	p.mu.Lock()
	stream, hasStream := p.streams[execID]
	if !hasStream {
		p.pendings[execID] = job
		p.mu.Unlock()
		p.logInfo("connector execute queued: exec=%s (connector not connected)", execID)
		return nil
	}
	p.mu.Unlock()

	if err := stream.Send(&pb.WorkerMessage{Message: &pb.WorkerMessage_Execute{Execute: job}}); err != nil {
		return err
	}
	p.logInfo("connector execute sent: exec=%s job=%s tool=%s", execID, job.GetJobId(), job.GetTool())
	return nil
}

// HasStream reports whether a live connector stream is registered for execID.
func (p *Proxy) HasStream(execID string) bool {
	p.mu.RLock()
	_, ok := p.streams[execID]
	p.mu.RUnlock()
	return ok
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

// HasDone peeks whether Done was received for execID without consuming the
// flag (unlike PopDone). Used by the health monitor to distinguish "container
// exited after sending Done" from "container exited before completing".
func (p *Proxy) HasDone(execID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.done[execID]
}

// OnConnectorDown closes the channel for execID and removes it. It also drops
// any ExecuteJob still queued as pending for execID: the connector is gone, so
// that job can never be delivered, and a later registration must not resurrect
// it. It does NOT touch the stream registration — UnregisterConnector owns
// that (a live stream must keep flushing on later SendExecute calls).
// Safe to call multiple times; double-close is avoided.
func (p *Proxy) OnConnectorDown(execID string) {
	p.mu.Lock()
	hadPending := false
	if _, ok := p.pendings[execID]; ok {
		delete(p.pendings, execID)
		hadPending = true
	}
	ch, ok := p.chans[execID]
	if ok {
		delete(p.chans, execID)
	}
	p.mu.Unlock()
	if hadPending {
		p.logWarning("connector execute pending dropped: exec=%s (connector down)", execID)
	}
	if ok {
		// close outside lock to avoid blocking
		func() {
			defer func() { _ = recover() }()
			close(ch)
		}()
	}
}
