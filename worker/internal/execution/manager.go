package execution

import (
	"context"
	"fmt"
	"sync"
	"time"

	"oasm-worker/internal/runtime"
)

// Manager tracks concurrent executions with a state machine.
// It replaces the legacy exec.Command sh -c path with isolated executions.
type Manager struct {
	mu             sync.Mutex
	rt             runtime.ExecutionRuntime
	maxConcurrency int
	execs          map[string]*Execution
	nextID         int
}

// NewManager creates a Manager backed by rt with at most maxConcurrency concurrent executions.
func NewManager(rt runtime.ExecutionRuntime, maxConcurrency int) *Manager {
	return &Manager{rt: rt, maxConcurrency: maxConcurrency, execs: map[string]*Execution{}}
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
			_ = m.Cancel(context.Background(), execID)
		})
	}
	return id, nil
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
			_ = m.Cancel(context.Background(), execID)
		})
		return id, nil
	}
	return m.Submit(ctx, spec)
}

// Cancel propagates to the runtime (rt.Cancel), marks cancelled, and removes from active tracking.
// ponytail: best-effort runtime Cancel + Cleanup; no DB requeue here.
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
	_ = m.rt.Cancel(ctx, h)
	_ = m.rt.Cleanup(ctx, h)
	return nil
}

// OnConnectorDown marks the execution done and cleans up runtime resources.
// Called by connector proxy when a connector disconnects/crashes.
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
	_ = m.rt.Cleanup(ctx, h)
	return nil
}

// ActiveCount returns the number of active executions.
func (m *Manager) ActiveCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.execs)
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
