package execution

import (
	"context"
	"fmt"
	"sync"
	"time"

	"oasm-worker/internal/runtime"
)

// Logger receives error notifications from Manager when background
// container-engine operations fail. TuiLogger (worker package) satisfies it.
// A nil logger disables reporting.
type Logger interface {
	Error(msg string, args ...any)
	ErrorE(msg string, err error)
}

// Manager tracks concurrent executions with a state machine.
// It replaces the legacy exec.Command sh -c path with isolated executions.
type Manager struct {
	mu             sync.Mutex
	rt             runtime.ExecutionRuntime
	maxConcurrency int
	execs          map[string]*Execution
	nextID         int
	logger         Logger
}

// NewManager creates a Manager backed by rt with at most maxConcurrency concurrent executions.
func NewManager(rt runtime.ExecutionRuntime, maxConcurrency int) *Manager {
	return &Manager{rt: rt, maxConcurrency: maxConcurrency, execs: map[string]*Execution{}}
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

// Submit enforces maxConcurrency, calls rt.Create+Start, and tracks the execution.
// Image is required and passed through to the runtime (resolved by Core ConnectorRegistry 1.5).
// If spec.Limits[timeoutSeconds] is set (>0), a timer auto-cancels the execution.
func (m *Manager) Submit(ctx context.Context, spec JobSpec) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// maxConcurrency <= 0 means unlimited — worker semaphore is the sole concurrency gate.
	if m.maxConcurrency > 0 && len(m.execs) >= m.maxConcurrency {
		return "", fmt.Errorf("max concurrency reached")
	}
	// Monotonic counter (not len(execs)): Cancel deletes entries, so a size-derived
	// ID collides with and overwrites a still-running execution.
	m.nextID++
	id := fmt.Sprintf("exec-%d", m.nextID)
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
	}, runtime.RuntimeOpts{TraceID: spec.TraceID})
	if err != nil {
		return "", err
	}
	if err := m.rt.Start(ctx, h); err != nil {
		return "", err
	}
	m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: h}
	// ponytail: auto-timeout via AfterFunc; no jitter, no DB requeue — minimal wiring
	if secs := timeoutSeconds(spec.Limits); secs > 0 {
		execID := id
		time.AfterFunc(time.Duration(secs)*time.Second, func() {
			m.cancelTimeout(execID)
		})
	}
	return id, nil
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

// Cancel propagates to the runtime (rt.Cancel), marks cancelled, and removes from active tracking.
// Container-engine failures during Cancel/Cleanup are logged (not returned) —
// the caller-facing error contract is unchanged.
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
	m.mu.Unlock()
	if err := m.rt.Cancel(ctx, h); err != nil {
		m.logError("container cancel failed", err)
	}
	if err := m.rt.Cleanup(ctx, h); err != nil {
		m.logError("container cleanup failed", err)
	}
	return nil
}

// OnConnectorDown marks the execution done and cleans up runtime resources.
// Called by connector proxy when a connector disconnects/crashes.
// A failed runtime Cleanup is logged, never silently dropped.
func (m *Manager) OnConnectorDown(ctx context.Context, execID string) error {
	m.mu.Lock()
	e, ok := m.execs[execID]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	h := e.Handle
	e.State = StateDone
	delete(m.execs, execID)
	m.mu.Unlock()
	if err := m.rt.Cleanup(ctx, h); err != nil {
		m.logError("container cleanup failed", err)
	}
	return nil
}

// ActiveCount returns the number of active executions.
func (m *Manager) ActiveCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.execs)
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
	switch v := limits["timeoutSeconds"].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	}
	return 0
}
