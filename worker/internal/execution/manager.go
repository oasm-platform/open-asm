package execution

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"oasm-worker/internal/runtime"
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
// The connector protocol is one stream = one execution: every execution gets
// its own container (1:1 model). There is no container-reuse pool — pooled
// reuse would misroute/starve jobs 2..N and carry a stale EXECUTION_ID env.
type Manager struct {
	mu             sync.Mutex
	rt             runtime.ExecutionRuntime
	maxConcurrency int
	execs          map[string]*Execution
	nextID         int
	logger         Logger

	// tokenMu guards tokens: per-execution single-use connector auth tokens
	// (one token = one execution). They are minted before container creation
	// and deleted on Release/Cancel (single-use lifecycle). Notably separate
	// from mu: ExecToken is read concurrently by the connector server's
	// Register handshake goroutines.
	tokenMu sync.RWMutex
	tokens  map[string]string
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
	if m.maxConcurrency > 0 && len(m.execs) >= m.maxConcurrency {
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

	h, err := m.rt.Create(ctx, runtime.JobSpec{
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
		// Single-use auth: the connector's Register must present this token
		// (WORKER_TOKEN env); the connector server validates it per-execution.
		ConnectorToken: spec.ConnectorToken,
	}, runtime.RuntimeOpts{TraceID: spec.TraceID})
	if err != nil {
		// No execution was created — drop the token so a stray connector can
		// never authenticate against a ghost execution.
		m.tokenMu.Lock()
		delete(m.tokens, id)
		m.tokenMu.Unlock()
		m.mu.Unlock()
		return "", err
	}
	if err := m.rt.Start(ctx, h); err != nil {
		m.mu.Unlock()
		return "", err
	}
	m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: h}
	m.mu.Unlock()
	// Never log the token value — only that it was set. Logged outside the
	// critical section (logInfo takes mu).
	m.logInfo("execution token set token_set=%t", true)
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

// Cancel marks the execution cancelled and stops tracking it. The 1:1
// container is stopped and removed immediately (rt.Cancel + rt.Cleanup).
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
	m.mu.Unlock()
	if err := m.rt.Cancel(ctx, h); err != nil {
		m.logError("container cancel failed", err)
	}
	if err := m.rt.Cleanup(ctx, h); err != nil {
		m.logError("container cleanup failed", err)
	}
	return nil
}

// Release retires an execution's claim on its 1:1 container: cleanup runs
// immediately. OnConnectorDown is the legacy name for this signal.
func (m *Manager) Release(ctx context.Context, execID string) error {
	m.mu.Lock()
	e, ok := m.execs[execID]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	h := e.Handle
	e.State = StateDone
	delete(m.execs, execID)
	// Single-use: the token dies with its execution.
	m.tokenMu.Lock()
	delete(m.tokens, execID)
	m.tokenMu.Unlock()
	m.mu.Unlock()
	if err := m.rt.Cleanup(ctx, h); err != nil {
		m.logError("container cleanup failed", err)
	}
	return nil
}

// OnConnectorDown is the legacy name for Release; a connector's disconnect
// releases this execution's claim on its container.
func (m *Manager) OnConnectorDown(ctx context.Context, execID string) error {
	return m.Release(ctx, execID)
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
