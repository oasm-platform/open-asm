package execution

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"oasm-worker/internal/resource"
	"oasm-worker/internal/runtime"
)

// Resource limit keys inside JobSpec.Limits — the scheduling context
// (core-api) speaks cpu/memory/timeoutSeconds per the connector manifest;
// parsing rules live in internal/resource.
const (
	JobCPUKey    = "cpu"
	JobMemoryKey = "memory"
)

// Logger receives error notifications from Manager when background
// container-engine operations fail. TuiLogger (worker package) satisfies it.
// A nil logger disables reporting.
type Logger interface {
	Info(msg string, args ...any)
	Error(msg string, args ...any)
	ErrorE(msg string, err error)
}

// Manager tracks concurrent executions with a state machine.
// It replaces the legacy exec.Command sh -c path with isolated executions.
// Phase 2 warm pool: when a PoolManager is wired (node mode, pool_enabled),
// executions acquire+release idle containers of the same image instead of the
// legacy 1-container-per-execution model. Pool nil = legacy 1:1 unchanged.
type Manager struct {
	mu             sync.Mutex
	rt             runtime.ExecutionRuntime
	maxConcurrency int
	execs          map[string]*Execution
	nextID         int
	logger         Logger

	// pool is the warm-container pool; nil keeps the legacy 1:1 model.
	pool *PoolManager
	// binder releases the proxy's execID→container routing when an execution
	// ends (structural connector.StreamBinder; nil = no proxy wiring).
	binder streamBinder
	// evictor removes a dead container from the proxy (structural
	// connector.Evictor; nil = no proxy wiring).
	evictor containerEvictor

	// tokenMu guards tokens: per-execution single-use connector auth tokens
	// (one token = one execution). They are minted before container creation
	// and deleted on Release/Cancel (single-use lifecycle). Notably separate
	// from mu: ExecToken is read concurrently by the connector server's
	// Register handshake goroutines.
	tokenMu sync.RWMutex
	tokens  map[string]string

	// pending counts Submits holding a reserved maxConcurrency slot whose
	// execution is not yet in execs: with the lock narrowed (rt.Create/Start
	// run WITHOUT mu), the slot must be reserved when the spec is built —
	// len(execs) alone would let concurrent Submits overshoot the cap during
	// a slow image pull. Guarded by mu.
	pending int
}

// streamBinder / containerEvictor are the structural slices of
// connector.StreamBinder / connector.Evictor the Manager consumes. Declared
// locally so the execution package never imports connector.
type streamBinder interface {
	BindExec(execID, containerID string)
	ReleaseExec(execID string)
	// AdoptStream re-owns a pooled container's live stream for the new
	// execution on reuse; errors when the container has no live stream.
	AdoptStream(containerID, newExecID string) error
}

type containerEvictor interface {
	RemoveContainer(containerID string)
}

// NewManager creates a Manager backed by rt with at most maxConcurrency
// concurrent executions (<=0 means unlimited — the worker semaphore is then
// the sole concurrency gate).
func NewManager(rt runtime.ExecutionRuntime, maxConcurrency int) *Manager {
	return &Manager{
		rt:             rt,
		maxConcurrency: maxConcurrency,
		execs:          map[string]*Execution{},
		tokens:         map[string]string{},
	}
}

// SetLogger wires an error logger for background container-engine operations.
// Nil disables logging (safe). Call once at startup, before Submit.
func (m *Manager) SetLogger(l Logger) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logger = l
}

// SetPool wires the warm-container pool (node mode only). The legacy 1:1
// model (pool nil) keeps every execution on its own container. Call once at
// startup, before Submit.
func (m *Manager) SetPool(p *PoolManager) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pool = p
}

// SetStreamBinder wires the proxy execID→container routing (connector
// package, structural). Nil = no proxy to bind.
func (m *Manager) SetStreamBinder(b streamBinder) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.binder = b
}

// SetEvictor wires proxy container removal for the sweeper (connector
// package, structural). Nil = no proxy to evict.
func (m *Manager) SetEvictor(e containerEvictor) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.evictor = e
}

// logError reports a container-engine operation failure via the injected
// Logger. No-op when no logger is set. Never panics.
func (m *Manager) logError(op string, err error) {
	m.mu.Lock()
	l := m.logger
	m.mu.Unlock()
	if l == nil {
		return
	}
	l.ErrorE(op, err)
}

// logInfo reports a lifecycle event via the injected Logger. No-op when no
// logger is set. Never panics. Sensitive values (tokens, keys) are never
// passed through this — callers log flags (token_set=%t), not values.
func (m *Manager) logInfo(msg string, args ...any) {
	m.mu.Lock()
	l := m.logger
	m.mu.Unlock()
	if l == nil {
		return
	}
	l.Info(msg, args...)
}

// generateExecToken mints the per-execution single-use connector auth token:
// 32 random bytes encoded as 64 hex chars. crypto/rand is used so container
// dial-backs cannot guess or replay another execution's token.
func generateExecToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand only fails when the OS entropy source is broken; falling
		// back to a zero token would silently disable auth, so surface it.
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return hex.EncodeToString(b)
}

// Submit enforces maxConcurrency, calls rt.Create+Start, and tracks the execution.
// Image is required and passed through to the runtime (resolved by Core ConnectorRegistry 1.5).
// If spec.Limits[JobTimeoutSecondsKey] is set (>0), a timer auto-cancels the execution.
// The 1:1 model: exactly one container per execution, never shared.
func (m *Manager) Submit(ctx context.Context, spec JobSpec) (string, error) {
	m.mu.Lock()
	// maxConcurrency <= 0 means unlimited — worker semaphore is the sole concurrency gate.
	// Admission counts Submits holding a reserved slot too (m.pending): with
	// the lock narrowed, rt.Create runs after mu is released, so a slot must
	// be reserved when the spec is built — len(execs) alone would let a
	// concurrent Submit overshoot the cap during a slow image pull.
	if m.maxConcurrency > 0 && len(m.execs)+m.pending >= m.maxConcurrency {
		m.mu.Unlock()
		return "", fmt.Errorf("max concurrency reached")
	}
	// Timeout contract: the connect deadline must stay below the manifest job
	// timeout, otherwise the connect timer cancels the execution before the
	// configured job timeout can ever apply. Fail fast — no container created.
	if err := ValidateConnectorTimeouts(timeoutSeconds(spec.Limits), ConnectorConnectTimeout); err != nil {
		m.mu.Unlock()
		return "", err
	}
	// Monotonic counter (not len(execs)): Cancel deletes entries, so a size-derived
	// ID collides with and overwrites a still-running execution.
	m.nextID++
	id := fmt.Sprintf("exec-%d", m.nextID)

	// Per-execution single-use connector auth token: minted and registered
	// BEFORE the container is created so a fast connector that dials back
	// immediately finds its token on the Register handshake (no early-connect
	// race). The token is injected into the container via spec.ConnectorToken
	// (WORKER_TOKEN env) and deleted on Release/Cancel.
	token := generateExecToken()
	m.tokenMu.Lock()
	m.tokens[id] = token
	m.tokenMu.Unlock()
	spec.ConnectorToken = token

	// Manifest resource limits → runtime opts. Malformed values must never
	// fail the job: warn and run unlimited (CPU=0/Memory=0 in Docker terms).
	// Timeout-only limits keep the legacy unlimited opts — the timeout is
	// enforced separately by the auto-cancel timer below.
	opts := runtime.RuntimeOpts{TraceID: spec.TraceID}
	var limitWarn error
	if cpu, mem := limitsCPUandMemory(spec.Limits); cpu != "" && mem != "" {
		ropts, err := resource.ToRuntimeOpts(resource.Limits{
			CPU:            cpu,
			Memory:         mem,
			TimeoutSeconds: timeoutSeconds(spec.Limits),
		}, spec.TraceID)
		if err != nil {
			limitWarn = err
		} else {
			opts = ropts
		}
	}

	// Pool key: normalized (lowercase) image — the acquire key for warm
	// container reuse.
	poolKey := normalizePoolKey(spec.Image)

	// Connector wiring is configured once at startup (SetPool/SetStreamBinder/
	// SetEvictor before the first Submit) — snapshot it under the lock and use
	// the locals in the un-locked sections below.
	p := m.pool
	binder := m.binder
	evictor := m.evictor

	// Reserve the concurrency slot across the Create/Start window (see the
	// admission check above): the execution is not in m.execs yet.
	m.pending++

	// Acquire-or-create (Phase 2):
	//  - pool hit: adopt the existing container. It is already running with
	//    its original manifest limits applied; the reused stream is already
	//    authenticated, so no Create/Start/token handshake is needed.
	//  - pool miss (or pool disabled): create + start a fresh container, then
	//    record it in the pool as busy.
	// poolLogs carries the Phase 3 acquire/create outcome as SEPARATE lines
	// (one event per line, never overwriting each other); logged after
	// mu.Unlock (logInfo takes mu itself — calling it here would deadlock).
	// adoptEvicted/adoptErr record an adopt failure so it can be logged as its
	// own ERROR line and the container Stop+Cleanup'd outside the lock.
	var poolLogs []string
	var adoptEvicted string
	var adoptErr error
	var h runtime.Handle
	if p != nil {
		if cid, ok := p.Acquire(id, poolKey); ok {
			h = runtime.Handle{ID: cid}
			poolLogs = append(poolLogs, fmt.Sprintf("pool reuse: container %s pool_key=%s", cid, poolKey))
			// Warm-pool reuse: the container's connector stream is already
			// live under the PREVIOUS execution's ID (the SDK loops on Recv
			// after Done and never re-registers). Route the stream to THIS
			// execution now — BindExec alone cannot: it sees only the pool
			// entry, which cleared the old execID on ReleaseToIdle. Without
			// the adopt, the next SendExecute queues behind a Register that
			// never arrives and the job deadlocks. A stream-less container
			// (dead / boot race) is evicted and falls through to a fresh
			// replica below — the evicted container is recorded so it is
			// stopped+cleaned up after the critical section instead of
			// leaking as an up-forever orphan.
			if binder != nil {
				if err := binder.AdoptStream(cid, id); err != nil {
					poolLogs = append(poolLogs, fmt.Sprintf("pool evict: container %s removed (adopt failed)", cid))
					adoptErr = err
					adoptEvicted = cid
					p.Evict(id)
					if evictor != nil {
						evictor.RemoveContainer(cid)
					}
					h = runtime.Handle{}
				} else {
					poolLogs = append(poolLogs, fmt.Sprintf("pool adopt: container=%s exec=%s", cid, id))
				}
			}
		} else if p.AtCapacity(poolKey) {
			// Phase 3 replica quota: no idle container AND the image's busy
			// count is at the cap — refuse instead of creating a replica. The
			// caller (job.go) backs off and retries; no container is created,
			// no Core failure is recorded.
			busy, max := p.busyCount(poolKey), p.maxReplicasPerImage
			poolLogs = append(poolLogs, fmt.Sprintf("pool exhausted: pool_key=%s busy=%d max=%d", poolKey, busy, max))
			// No execution was created — drop the token so a stray connector
			// can never authenticate against a ghost execution, and release
			// the reserved slot.
			m.pending--
			m.tokenMu.Lock()
			delete(m.tokens, id)
			m.tokenMu.Unlock()
			m.mu.Unlock()
			for _, line := range poolLogs {
				m.logInfo("%s", line)
			}
			return "", fmt.Errorf("%w: %s", ErrPoolExhausted, poolKey)
		}
	}
	// The runtime spec is built under the lock; the Docker calls (Create
	// including the image pull, Start) run WITHOUT mu (W1): an image pull
	// inside rt.Create can take minutes and must not block Cancel/Release/
	// Inspect/ActiveCount. Token-mint atomicity and exec-registration
	// ordering (pool busy entry + proxy bind BEFORE Start) are preserved
	// by the short critical sections after each Docker call.
	var createdSpec *runtime.JobSpec
	if h.ID == "" {
		createdSpec = &runtime.JobSpec{
			Tool:    spec.Tool,
			Image:   spec.Image,
			Version: spec.Version,
			Inputs:  spec.Inputs,
			Limits:  spec.Limits,
			TraceID: spec.TraceID,
			Config:  spec.Config,
			JobID:   spec.JobID,
			// Single source of truth: the connector registers under this ID
			// (EXECUTION_ID env), matching the proxy's pending/stream key.
			ExecID: id,
			// Pooled container identity for name + labels (docker runtime).
			PoolKey: poolKey,
			// Single-use auth: the connector's Register must present this
			// token (WORKER_TOKEN env); the connector server validates it
			// per-execution.
			ConnectorToken: spec.ConnectorToken,
		}
	}
	m.mu.Unlock()

	if createdSpec != nil {
		created, err := m.rt.Create(ctx, *createdSpec, opts)
		if err != nil {
			// No execution was created — drop the token so a stray connector
			// can never authenticate against a ghost execution, and release
			// the reserved concurrency slot.
			m.mu.Lock()
			m.pending--
			m.mu.Unlock()
			m.tokenMu.Lock()
			delete(m.tokens, id)
			m.tokenMu.Unlock()
			return "", err
		}
		h = created
		// Track the replica as busy FIRST: a connector that dials back while
		// the container boots must find the pool entry consistent (Sweep never
		// races a not-yet-tracked execution). Short critical section — no
		// runtime call inside.
		m.mu.Lock()
		if p != nil {
			cpu, mem := limitsCPUandMemory(spec.Limits)
			p.Add(poolEntry{
				ID:      h.ID,
				Image:   spec.Image,
				PoolKey: poolKey,
				CPU:     cpu,
				Memory:  mem,
				State:   PoolStateBusy,
				ExecID:  id,
			})
			poolLogs = append(poolLogs, fmt.Sprintf("pool miss: created replica container %s pool_key=%s busy=%d max=%d",
				h.ID, poolKey, p.busyCount(poolKey), p.maxReplicasPerImage))
		}
		// Bind BEFORE Start: the connector can dial back as soon as the
		// container boots. Routing the execution to its container first
		// guarantees RegisterConnector never falls into the adhoc key — an
		// unbound registration keys the stream under adhoc-<exec>, so the
		// container is never mapped under its real ID and pool reuse later
		// can never adopt it (silent Evict + orphan container: the
		// "reuse-miss" bug).
		if binder != nil {
			binder.BindExec(id, h.ID)
		}
		m.mu.Unlock()
		if err := m.rt.Start(ctx, h); err != nil {
			// Start failed: no execution exists. Undo the pool/proxy wiring
			// staged above (pool/binder/evictor carry their own locks — safe
			// without mu) and drop the single-use token so no ghost execution
			// can authenticate against a container that never ran.
			if p != nil {
				if cid := p.Evict(id); cid != "" && evictor != nil {
					evictor.RemoveContainer(cid)
				}
			}
			if binder != nil {
				binder.ReleaseExec(id)
			}
			m.tokenMu.Lock()
			delete(m.tokens, id)
			m.tokenMu.Unlock()
			m.mu.Lock()
			m.pending--
			m.mu.Unlock()
			return "", err
		}
	}
	m.mu.Lock()
	m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: h}
	// Route this execution to its container in the proxy. On a pool hit the
	// stream may already be live — BindExec pre-closes the registration signal
	// so the drain skips the connect timer.
	if binder != nil {
		binder.BindExec(id, h.ID)
	}
	// Registration completes the Submit: the reserved slot becomes a real
	// execution (pending → execs, same admission count total).
	m.pending--
	m.mu.Unlock()

	// An adopt failure is its own ERROR line (never overwritten by the
	// fallback "pool miss" line below), followed by a best-effort Stop+Cleanup
	// of the evicted container on a detached context: it is already out of
	// byID (Evict), so leaving it running makes it an invisible up-forever
	// orphan the sweeper can never see.
	if adoptEvicted != "" {
		m.logError(fmt.Sprintf("pool adopt failed: container=%s exec=%s", adoptEvicted, id), adoptErr)
		dctx, dcancel := context.WithTimeout(context.Background(), ConnectorCleanupTimeout)
		if err := m.rt.Cancel(dctx, runtime.Handle{ID: adoptEvicted}); err != nil {
			m.logError("pool adopt-fail stop failed", err)
		}
		if err := m.rt.Cleanup(dctx, runtime.Handle{ID: adoptEvicted}); err != nil {
			m.logError("pool adopt-fail cleanup failed", err)
		}
		dcancel()
	}
	// Never log the token value — only that it was set. Logged outside the
	// critical section (logInfo takes mu). Each phase-3 event is its own line.
	for _, line := range poolLogs {
		m.logInfo("%s", line)
	}
	m.logInfo("execution token set token_set=%t", true)
	if limitWarn != nil {
		m.logInfo("running unlimited: invalid resource limits (%v)", limitWarn)
	}
	m.armTimeout(id, spec)
	return id, nil
}

// armTimeout auto-cancels the execution when spec.Limits carries
// timeoutSeconds > 0. The timer's only failure is "not found" (already
// removed); per the terminal-logging mandate it is still reported.
func (m *Manager) armTimeout(id string, spec JobSpec) {
	if secs := timeoutSeconds(spec.Limits); secs > 0 {
		execID := id
		time.AfterFunc(time.Duration(secs)*time.Second, func() {
			m.cancelTimeout(execID)
		})
	}
}

// cancelTimeout best-effort cancels an execution when its timer fires. The
// only failure is "not found" (already removed); per the terminal-logging
// mandate it is still reported, never silently dropped.
func (m *Manager) cancelTimeout(execID string) {
	if err := m.Cancel(context.Background(), execID); err != nil {
		m.logError("timeout cancel failed", err)
	}
}

// SubmitWithTimeout submits and auto-cancels after timeout (0 disables).
// Arms its own timer only when spec.Limits does NOT already carry timeoutSeconds,
// otherwise Submit's built-in timer would fire too — avoid double-arm duplicate cancels.
func (m *Manager) SubmitWithTimeout(ctx context.Context, spec JobSpec, timeout time.Duration) (string, error) {
	if timeout > 0 && timeoutSeconds(spec.Limits) <= 0 {
		id, err := m.Submit(ctx, spec)
		if err != nil {
			return "", err
		}
		execID := id
		time.AfterFunc(timeout, func() {
			m.cancelTimeout(execID)
		})
		return id, nil
	}
	return m.Submit(ctx, spec)
}

// Cancel marks the execution cancelled and stops tracking it. The container is
// stopped and removed immediately (rt.Cancel + rt.Cleanup) regardless of pool
// state — a cancelled execution never leaves a warm container behind.
func (m *Manager) Cancel(ctx context.Context, id string) error {
	m.mu.Lock()
	e, ok := m.execs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("not found")
	}
	h := e.Handle
	e.State = StateCancelled
	delete(m.execs, id)
	// Single-use: the token dies with its execution.
	m.tokenMu.Lock()
	delete(m.tokens, id)
	m.tokenMu.Unlock()
	// Pooled container dies with its cancelled execution.
	if m.pool != nil {
		if cid := m.pool.Evict(id); cid != "" && m.evictor != nil {
			m.evictor.RemoveContainer(cid)
		}
	}
	if m.binder != nil {
		m.binder.ReleaseExec(id)
	}
	m.mu.Unlock()
	if err := m.rt.Cancel(ctx, h); err != nil {
		m.logError("container cancel failed", err)
	}
	if err := m.rt.Cleanup(ctx, h); err != nil {
		m.logError("container cleanup failed", err)
	}
	return nil
}

// Release retires an execution's claim on its container. With a pool wired the
// container is handed back IDLE for reuse (no Cleanup — it stays alive for the
// next execution of the same image); without a pool the legacy 1:1 teardown
// (immediate Cleanup) runs. OnConnectorDown is the legacy name for this
// signal.
func (m *Manager) Release(ctx context.Context, execID string) error {
	if m.pool != nil {
		m.pool.ReleaseToIdle(execID)
	}
	m.mu.Lock()
	e, ok := m.execs[execID]
	var h runtime.Handle
	if ok {
		h = e.Handle
		e.State = StateDone
		delete(m.execs, execID)
	}
	// Single-use: the token dies with its execution.
	m.tokenMu.Lock()
	delete(m.tokens, execID)
	m.tokenMu.Unlock()
	if m.binder != nil {
		m.binder.ReleaseExec(execID)
	}
	m.mu.Unlock()
	if !ok {
		return nil
	}
	if m.pool == nil {
		if err := m.rt.Cleanup(ctx, h); err != nil {
			m.logError("container cleanup failed", err)
		}
	}
	return nil
}

// OnConnectorDown is the legacy name for Release; a connector's disconnect
// releases this execution's claim on its container.
func (m *Manager) OnConnectorDown(ctx context.Context, execID string) error {
	return m.Release(ctx, execID)
}

// IsIdle reports whether the container backing execID is idle (no execution
// in flight). The job drain uses it to skip container health checks while a
// reused container sits between executions. False when the pool is disabled.
func (m *Manager) IsIdle(execID string) bool {
	if m.pool == nil {
		return false
	}
	return m.pool.IsIdle(execID)
}

// ReleaseToIdle implements connector.IdleNotifier: the connector server calls
// it after a clean Done so the pooled container goes back to the idle queue
// for reuse. No-op when the pool is disabled.
func (m *Manager) ReleaseToIdle(execID string) {
	if m.pool == nil {
		return
	}
	m.pool.ReleaseToIdle(execID)
}

// ContainerDown implements connector.IdleNotifier: the connector stream died
// unexpectedly, so the container can never be reused. It is evicted from the
// pool, stopped, removed and dropped from the proxy. No-op when the pool is
// disabled or the container is already gone.
func (m *Manager) ContainerDown(execID string) {
	// Single-use token: the token dies with its execution. Stream death is
	// terminal for this execution whether or not the pool is enabled, so the
	// token is deleted BEFORE the pool-nil early return.
	m.tokenMu.Lock()
	delete(m.tokens, execID)
	m.tokenMu.Unlock()
	if m.pool == nil {
		return
	}
	cid := m.pool.Evict(execID)
	if cid == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), ConnectorCleanupTimeout)
	defer cancel()
	if err := m.rt.Cancel(ctx, runtime.Handle{ID: cid}); err != nil {
		m.logError("pool evict cancel failed", err)
	}
	if err := m.rt.Cleanup(ctx, runtime.Handle{ID: cid}); err != nil {
		m.logError("pool evict cleanup failed", err)
	}
	if m.evictor != nil {
		m.evictor.RemoveContainer(cid)
	}
	m.logInfo("pool evict: container %s removed (connector stream down)", cid)
}

// SweepLoop runs the pool sweeper until ctx is cancelled: every
// ConnectorSweepInterval, idle containers past the idle timeout are stopped,
// removed and dropped from the proxy. Called only when the pool is enabled.
func (m *Manager) SweepLoop(ctx context.Context) {
	if m.pool == nil {
		return
	}
	ticker := time.NewTicker(ConnectorSweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, e := range m.pool.Sweep(time.Now()) {
				m.sweepContainer(e)
			}
		}
	}
}

// DrainPool force-collects every IDLE pooled container regardless of idle age
// and tears it down (Stop+Cleanup+proxy removal) via sweepContainer. Shutdown
// drain: workerCancel() only stops the SweepLoop — without an explicit drain
// every idle pooled container would outlive the worker as an up-forever
// orphan. Busy containers (live executions) are never touched: job draining
// (wait group) happens upstream before this runs. No-op when the pool is
// disabled (legacy 1:1 model has nothing pooled).
func (m *Manager) DrainPool() {
	if m.pool == nil {
		return
	}
	// A far-future "now": Sweep collects only entries idle past the timeout,
	// and at shutdown EVERY idle entry is due — advance now past the idle
	// timeout so age is irrelevant.
	future := time.Now().Add(m.pool.idleTimeout + time.Minute)
	for _, e := range m.pool.Sweep(future) {
		m.sweepContainer(e)
	}
}

// sweepContainer tears down one expired idle container (Stop+Cleanup) and
// removes it from the proxy. Best-effort: failures are logged, never fatal.
func (m *Manager) sweepContainer(e poolEntry) {
	// A swept entry that still names an execution (defensive: released entries
	// are cleared by ReleaseToIdle) drops that execution's single-use token
	// with it — no token survives the container that carried it.
	if e.ExecID != "" {
		m.tokenMu.Lock()
		delete(m.tokens, e.ExecID)
		m.tokenMu.Unlock()
	}
	ctx, cancel := context.WithTimeout(context.Background(), ConnectorCleanupTimeout)
	defer cancel()
	if err := m.rt.Cancel(ctx, runtime.Handle{ID: e.ID}); err != nil {
		m.logError("pool sweep stop failed", err)
	}
	if err := m.rt.Cleanup(ctx, runtime.Handle{ID: e.ID}); err != nil {
		m.logError("pool sweep cleanup failed", err)
	}
	if m.evictor != nil {
		m.evictor.RemoveContainer(e.ID)
	}
	m.logInfo("pool sweep: idle container %s removed (pool_key=%s)", e.ID, e.PoolKey)
}

// ActiveCount returns the number of active executions.
func (m *Manager) ActiveCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.execs)
}

// ExecToken returns the per-execution single-use connector auth token for an
// execution, and whether one exists. It structurally implements the
// connector.TokenLookup contract (the connector server calls it from its
// Register handshake goroutines). Any concurrently deleted token (Release/
// Cancel/Submit failure) reads as not-found.
func (m *Manager) ExecToken(execID string) (string, bool) {
	m.tokenMu.RLock()
	defer m.tokenMu.RUnlock()
	tok, ok := m.tokens[execID]
	return tok, ok
}

// Inspect returns the runtime inspect result for an execution by ID
// (health monitor). Errors when the execution is unknown or the runtime
// inspect fails.
func (m *Manager) Inspect(ctx context.Context, id string) (runtime.InspectResult, error) {
	m.mu.Lock()
	e, ok := m.execs[id]
	m.mu.Unlock()
	if !ok {
		return runtime.InspectResult{}, fmt.Errorf("execution %s not found", id)
	}
	return m.rt.Inspect(ctx, e.Handle)
}

// Logs opens the runtime log stream for an execution by ID (log tailer).
func (m *Manager) Logs(ctx context.Context, id string) (<-chan []byte, error) {
	m.mu.Lock()
	e, ok := m.execs[id]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("execution %s not found", id)
	}
	return m.rt.Logs(ctx, e.Handle)
}

func timeoutSeconds(limits map[string]any) int {
	if limits == nil {
		return 0
	}
	switch v := limits[JobTimeoutSecondsKey].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	}
	return 0
}

// limitsCPUandMemory extracts the CPU/memory strings from a Limits map.
// Missing or wrong-typed values yield empty strings (→ unlimited run).
func limitsCPUandMemory(limits map[string]any) (string, string) {
	if limits == nil {
		return "", ""
	}
	cpu, _ := limits[JobCPUKey].(string)
	mem, _ := limits[JobMemoryKey].(string)
	return cpu, mem
}
