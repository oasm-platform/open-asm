package connector

import (
	"fmt"
	"sync"

	pb "oasm-worker/internal/gen/connector"
)

// ---------------------------------------------------------------------------
// Warm-pool routing contracts (Phase 2). All are structural: the connector
// package declares them, the execution package satisfies them without imports.
// ---------------------------------------------------------------------------

// StreamBinder lets the Manager bind an execution to a pooled container before
// the connector SDK registers, so the proxy can route to the container ID and
// pre-close the registration signal (reuse skips the connect timer).
type StreamBinder interface {
	BindExec(execID, containerID string)
	ReleaseExec(execID string)
	// AdoptStream re-owns a pooled container's live stream for a new execution
	// on warm-pool reuse. Errors when the container has no live stream (the
	// caller falls back to a fresh container).
	AdoptStream(containerID, newExecID string) error
}

// Evictor lets the Manager remove a pooled container from the proxy when the
// sweeper collects it or the connector stream dies.
type Evictor interface {
	RemoveContainer(containerID string)
}

// IdleNotifier lets the connector server hand an execution back to the pool
// on Done (keep the container + stream alive) and report unexpected stream
// death (evict the container).
type IdleNotifier interface {
	ReleaseToIdle(execID string)
	ContainerDown(execID string)
}

// ResultMsg is one streamed Result delivery: the raw payload plus any
// structured findings the connector attached (findings is nil for connectors
// that only stream raw data — the Result.findings field is omitted).
// Exported (beyond the original internal name) so the worker drain can build
// and read the channels it registers on the proxy.
type ResultMsg struct {
	Data     []byte
	Findings []*pb.Finding
}

// connStream is one pooled container's connector stream state. stream is nil
// until the connector SDK registers; ownerExecID is the execution that
// registered it (authoritative while busy).
type connStream struct {
	stream      pb.ConnectorService_ConnectServer
	ownerExecID string
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
	// containers maps pooled container ID → its connector stream. A container
	// outlives its execution (Phase 2 warm pool): the stream is kept alive
	// across sequential executions and only dies on sweep/eviction. An
	// unbound registration (no prior BindExec) gets an adhoc container entry
	// "adhoc-<execID>" keeping the legacy direct-runtime single-exec path
	// working unchanged.
	containers map[string]*connStream
	// execIndex maps execID → container ID for routing SendExecute/Register
	// to the container stream. MaxJobsPerContainer=1 means at most one
	// execution is bound per container at a time.
	execIndex map[string]string
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
		chans:      map[string]chan ResultMsg{},
		errors:     map[string]string{},
		done:       map[string]bool{},
		containers: map[string]*connStream{},
		execIndex:  map[string]string{},
		pendings:   map[string]*pb.ExecuteJob{},
		regChans:   map[string]*regSignal{},
	}
}

// RegisterConnector stores the live bidi stream for execID's container and
// flushes any ExecuteJob queued before the connector connected. An empty
// execID is never registered here: the server rejects empty execution_id in
// Register before mapping (see server.go), so this guard only defends against
// internal misuse. A second registration while the container's stream is
// already live is REJECTED: Phase 2 keeps one stream per pool container, and
// silently replacing it would strand in-flight Sends.
func (p *Proxy) RegisterConnector(execID string, stream pb.ConnectorService_ConnectServer) error {
	if execID == "" || stream == nil {
		return nil
	}
	p.mu.Lock()
	containerID, ok := p.execIndex[execID]
	if !ok {
		// No prior BindExec: direct runtime / legacy single-exec path. Track
		// the stream under an adhoc container key so routing stays uniform.
		containerID = "adhoc-" + execID
		p.execIndex[execID] = containerID
	}
	cs, exists := p.containers[containerID]
	if !exists {
		cs = &connStream{}
		p.containers[containerID] = cs
	}
	if cs.stream != nil {
		p.mu.Unlock()
		return fmt.Errorf("connector stream already registered for exec %s", execID)
	}
	cs.stream = stream
	cs.ownerExecID = execID

	pending, hasPending := p.pendings[execID]
	if hasPending {
		delete(p.pendings, execID)
	}
	// Registration signal: close the open waiter channel, or store an
	// already-closed one so a late WaitRegistered returns immediately. Never
	// delete here — the drain may wait for registration after it happened.
	// A second RegisterConnector must not double-close, hence the closed flag.
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

// BindExec pre-binds an execution to a pooled container before the connector
// SDK registers. The Manager calls it on container create and on pool acquire
// (reuse). If the container's stream is already live (reuse), the registration
// signal is pre-closed so the drain skips the connect timer. Calling BindExec
// twice for the same execID is a no-op.
func (p *Proxy) BindExec(execID, containerID string) {
	if execID == "" || containerID == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	cs, ok := p.containers[containerID]
	if !ok {
		cs = &connStream{ownerExecID: execID}
		p.containers[containerID] = cs
	}
	if _, bound := p.execIndex[execID]; bound {
		return
	}
	p.execIndex[execID] = containerID
	if cs.stream != nil {
		// Stream already live: pre-close the signal (skip connect timer).
		ch := make(chan struct{})
		close(ch)
		p.regChans[execID] = &regSignal{ch: ch, closed: true}
	} else if _, exists := p.regChans[execID]; !exists {
		p.regChans[execID] = &regSignal{ch: make(chan struct{})}
	}
}

// AdoptStream re-owns a pooled container's live stream for newExecID on
// warm-pool reuse. The OLD execution finished with a clean Done: the stream
// stays open and the connector SDK keeps looping on Recv (it never
// re-registers). Transferring the routing here — BEFORE SendExecute — is what
// unblocks the next ExecuteJob; routing it under a brand-new execID would
// queue it behind a Register that never arrives (the warm-pool deadlock).
//
// Keyed by containerID because the old execID is unknowable at the reuse call
// site (the pool clears it on ReleaseToIdle); ownerExecID on the container
// entry records the transfer. Re-binds execIndex[newExecID] even when the
// manager skipped BindExec, pre-closes the registration signal (stream
// already connected — drain skips the connect timer), and flushes any
// ExecuteJob queued while the app raced the adopt. Double-adopt (container
// already owned by newExecID) is a no-op. Errors only when the container has
// no live stream (dead container / boot race) — the caller then falls back to
// creating a fresh container.
func (p *Proxy) AdoptStream(containerID, newExecID string) error {
	if containerID == "" || newExecID == "" {
		return fmt.Errorf("adopt stream: invalid container %q exec %q", containerID, newExecID)
	}
	p.mu.Lock()
	cs, ok := p.containers[containerID]
	if !ok || cs.stream == nil {
		p.mu.Unlock()
		return fmt.Errorf("adopt stream: container %s has no live stream", containerID)
	}
	if cs.ownerExecID == newExecID {
		p.mu.Unlock()
		return nil
	}
	if _, bound := p.execIndex[newExecID]; !bound {
		p.execIndex[newExecID] = containerID
	}
	cs.ownerExecID = newExecID
	// Stream already live: pre-close the signal (skip connect timer). Never
	// delete here — the drain may wait for registration after the adopt.
	if sig, ok := p.regChans[newExecID]; ok {
		if !sig.closed {
			close(sig.ch)
			sig.closed = true
		}
	} else {
		ch := make(chan struct{})
		close(ch)
		p.regChans[newExecID] = &regSignal{ch: ch, closed: true}
	}
	pending, hasPending := p.pendings[newExecID]
	if hasPending {
		delete(p.pendings, newExecID)
	}
	stream := cs.stream
	p.mu.Unlock()

	if hasPending {
		// Flush outside the lock; sendMu serializes against SendExecute and
		// the RegisterConnector flush (one Send at a time).
		p.sendMu.Lock()
		err := stream.Send(&pb.WorkerMessage{Message: &pb.WorkerMessage_Execute{Execute: pending}})
		p.sendMu.Unlock()
		if err != nil {
			return err
		}
		p.logInfo("connector execute flushed: exec=%s job=%s", newExecID, pending.GetJobId())
	}
	p.logInfo("connector stream adopted: container=%s exec=%s", containerID, newExecID)
	return nil
}

// ReleaseExec drops an execution's index entry (and registration signal). The
// container entry itself survives — pool reuse. Called when an execution ends
// (ReleaseToIdle) or is cancelled.
func (p *Proxy) ReleaseExec(execID string) {
	p.mu.Lock()
	delete(p.execIndex, execID)
	delete(p.regChans, execID)
	p.mu.Unlock()
}

// RemoveContainer removes a container and every execution bound to it from the
// routing tables. The sweeper calls it after Stop+Cleanup; the connector
// death path calls it after unexpected stream EOF.
func (p *Proxy) RemoveContainer(containerID string) {
	p.mu.Lock()
	delete(p.containers, containerID)
	for execID, cid := range p.execIndex {
		if cid == containerID {
			delete(p.execIndex, execID)
			delete(p.regChans, execID)
		}
	}
	p.mu.Unlock()
}

// UnregisterConnector detaches the live stream from execID's container (EOF /
// sweep). The container entry and execution index survive — Phase 2 pool
// reuse. It does not touch the result channel — OnConnectorDown owns that
// (avoids double close).
func (p *Proxy) UnregisterConnector(execID string) {
	if execID == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	cid, ok := p.execIndex[execID]
	if !ok {
		return
	}
	if cs := p.containers[cid]; cs != nil {
		cs.stream = nil
	}
}

// SendExecute delivers job to the connector stream for execID's container, or
// queues it as pending until the container's connector registers. Safe to call
// before the connector connects (container boot race). Returns an error only
// when an immediate send to a live stream fails.
func (p *Proxy) SendExecute(execID string, job *pb.ExecuteJob) error {
	if execID == "" || job == nil {
		return nil
	}
	p.mu.Lock()
	cid, ok := p.execIndex[execID]
	var stream pb.ConnectorService_ConnectServer
	if ok {
		if cs := p.containers[cid]; cs != nil {
			stream = cs.stream
		}
	}
	if !ok || stream == nil {
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

// HasStream reports whether a live connector stream is registered for execID's
// container.
func (p *Proxy) HasStream(execID string) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	cid, ok := p.execIndex[execID]
	if !ok {
		return false
	}
	cs, ok := p.containers[cid]
	return ok && cs != nil && cs.stream != nil
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
