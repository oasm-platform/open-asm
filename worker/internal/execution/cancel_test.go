package execution

import (
	"context"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

func TestManagerCancelPropagatesToRuntime(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0", Inputs: map[string]any{"target": "https://example.com"}})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}
	if rt.CancelCallCount() != 1 {
		t.Fatalf("expected runtime Cancel called once, got %d", rt.CancelCallCount())
	}
	if m.ActiveCount() != 0 {
		t.Fatalf("expected 0 active after cancel, got %d", m.ActiveCount())
	}
}

func TestTimeoutCancelsExecution(t *testing.T) {
	// Submit rejects Limits below the connect deadline (timeouts.go invariant),
	// so the Limits-driven auto-cancel timer is exercised white-box: register an
	// execution and arm its timer directly (SubmitWithTimeout covers the
	// external path in TestSubmitWithTimeout).
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	id := "exec-arm-1"
	spec := JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0", Limits: map[string]any{JobTimeoutSecondsKey: 1}}
	m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: runtime.Handle{ID: "fake-1"}}
	m.armTimeout(id, spec)
	time.Sleep(1200 * time.Millisecond)
	if m.ActiveCount() != 0 {
		t.Fatalf("expected auto-cancel after timeout, got %d active", m.ActiveCount())
	}
}

func TestSubmitWithTimeout(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	id, err := m.SubmitWithTimeout(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}, 300*time.Millisecond)
	if err != nil {
		t.Fatalf("SubmitWithTimeout failed: %v", err)
	}
	time.Sleep(500 * time.Millisecond)
	if m.ActiveCount() != 0 {
		t.Fatalf("expected auto-cancel via SubmitWithTimeout, got %d", m.ActiveCount())
	}
	_ = id
	if rt.CancelCallCount() != 1 {
		t.Fatalf("expected 1 cancel call, got %d", rt.CancelCallCount())
	}
}
