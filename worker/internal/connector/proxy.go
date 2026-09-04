package connector

import (
	"sync"

	pb "oasm-worker/internal/gen/connector"
)

// ResultMsg is one streamed Result delivery: the raw payload plus any
// structured findings the connector attached (findings is nil for connectors
// that only stream raw data — the Result.findings field is omitted).
// Exported (beyond the original internal name) so the worker drain can build
// and read the channels it registers on the proxy.
type ResultMsg struct {
	Data     []byte
	Findings []*pb.Finding
}

type Proxy struct {
	mu     sync.RWMutex
	sendMu sync.Mutex
	// sendMu serializes every stream.Send on the registered connector
	// streams. grpc-go bidi streams are not safe for concurrent Send: two
	// parallel Sends can panic inside the transport instead of returning an
	// error. RegisterConnector's pending flush runs on the Connect handler
	// goroutine while SendExecute runs on job goroutines, so all Sends
	// funnel through this one mutex — one Send at a time.
	chans  map[string]chan ResultMsg
	errors map[string]string
	done   map[string]bool
	// streams maps execID → live connector bidi stream for ExecuteJob delivery.
	streams map[string]pb.ConnectorService_ConnectServer
	// pendings holds ExecuteJobs queued before the connector's stream arrived
	// (container boot race). Flushed on RegisterConnector.
	pendings map[string]*pb.ExecuteJob
	// regChans are registration signals: an open channel closes when the
	// connector for execID registers, or an already-closed channel is stored
	// for registrations that happened before WaitRegistered. The drain uses it
	// to disable the connect timeout once the connector is connected.
	regChans map[string]*regSignal
	logger   Logger
}

// regSignal is one execID's registration signal. closed records whether the
// channel was signaled so a reconnect (second RegisterConnector on the same
// execID) never double-closes. All access is under the proxy mutex.
type regSignal struct {
	ch     chan struct{}
	closed bool
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
		chans:    map[string]chan ResultMsg{},
		errors:   map[string]string{},
		done:     map[string]bool{},
		streams:  map[string]pb.ConnectorService_ConnectServer{},
		pendings: map[string]*pb.ExecuteJob{},
		regChans: map[string]*regSignal{},
	}
}

// RegisterConnector stores the live bidi stream for execID and flushes any
// ExecuteJob that was queued before the connector connected. An empty execID
// is never registered here: the server rejects empty execution_id in
// Register before mapping (see server.go), so this guard only defends against
// internal misuse — ignoring it (nil, no stream entry) is the safe behavior.
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
	// Registration signal: close the open waiter channel, or store an
	// already-closed one so a late WaitRegistered returns immediately. Never
	// delete here — the drain may wait for registration after it happened.
	// A reconnect (second RegisterConnector for the same execID) must not
	// double-close, hence the closed flag.
	if sig, ok := p.regChans[execID]; ok {
		if !sig.closed {
			close(sig.ch)
			sig.closed = true
		}
	} else {
		ch := make(chan struct{})
		close(ch)
		p.regChans[execID] = &regSignal{ch: ch, closed: true}
	}
	p.mu.Unlock()

	if hasPending {
		// Send outside the lock — a stalled connector must not block the
		// proxy. sendMu serializes this flush against concurrent SendExecute
		// sends on the same stream (one Send at a time).
		p.sendMu.Lock()
		err := stream.Send(&pb.WorkerMessage{Message: &pb.WorkerMessage_Execute{Execute: pending}})
		p.sendMu.Unlock()
		if err != nil {
			return err
		}
		p.logInfo("connector execute flushed: exec=%s job=%s", execID, pending.GetJobId())
	}
	return nil
}

// WaitRegistered returns a channel that closes once the connector for execID
// registers its stream. If the connector already registered, the returned
// channel is already closed. One registration signal per execID: repeated
// calls return the same channel.
func (p *Proxy) WaitRegistered(execID string) <-chan struct{} {
	p.mu.Lock()
	defer p.mu.Unlock()
	if sig, ok := p.regChans[execID]; ok {
		return sig.ch
	}
	sig := &regSignal{ch: make(chan struct{})}
	p.regChans[execID] = sig
	return sig.ch
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

	// sendMu serializes against the RegisterConnector pending flush and other
	// concurrent SendExecute calls: grpc-go streams allow one Send at a time.
	p.sendMu.Lock()
	err := stream.Send(&pb.WorkerMessage{Message: &pb.WorkerMessage_Execute{Execute: job}})
	p.sendMu.Unlock()
	if err != nil {
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

func (p *Proxy) Register(execID string, ch chan ResultMsg) {
	p.mu.Lock()
	p.chans[execID] = ch
	p.mu.Unlock()
}

func (p *Proxy) ForwardResult(execID string, data []byte, findings []*pb.Finding) {
	p.mu.RLock()
	ch, ok := p.chans[execID]
	p.mu.RUnlock()
	if !ok {
		return
	}
	// Blocking send: the drain loop is the sole consumer and always drains
	// until close, so a full buffer must never drop a result (the old
	// select-default silently lost every finding beyond the 16-slot buffer).
	// OnConnectorDown may close the channel while a send is blocked (health-
	// fail path); sending into a closed channel panics, so the send is
	// recover-guarded — a result dropped because the connector just died is
	// acceptable, a worker crash is not.
	defer func() { _ = recover() }()
	ch <- ResultMsg{Data: data, Findings: findings}
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
	// Drop the registration signal WITHOUT closing it: the drain may already
	// have consumed the close, and a double close would panic. After a
	// down/timeout the drain no longer waits on registration.
	delete(p.regChans, execID)
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
