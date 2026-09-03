package execution

import (
	"context"
	"sync"
	"testing"

	"oasm-worker/internal/runtime"
)

// recordingRuntime wraps FakeRuntime and counts Start calls so the Submit
// contract (exactly one Create + one Start) is assertable.
type recordingRuntime struct {
	*runtime.FakeRuntime
	mu         sync.Mutex
	startCount int
}

func (r *recordingRuntime) Start(_ context.Context, _ runtime.Handle) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.startCount++
	return nil
}

// Manager.Submit must hand its own exec-N ID to the runtime's Create so the
// container's EXECUTION_ID env (used by connector registration) matches the
// ID the proxy queues ExecuteJob under. Otherwise the pending job never
// flushes (hex id vs exec-N mismatch).
func TestManagerSubmitPassesExecIDToRuntime(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)

	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if id == "" {
		t.Fatal("empty exec id")
	}
	if len(rt.CreateSpecs) != 1 {
		t.Fatalf("expected 1 Create call, got %d", len(rt.CreateSpecs))
	}
	got := rt.CreateSpecs[0]
	if got.ExecID != id {
		t.Fatalf("runtime Create must receive Manager's execID %q, got %q", id, got.ExecID)
	}
}

// Manager.Submit creates then starts, and must not start twice (Create in the
// Docker runtime already starts the container; a second ContainerStart is the
// double-start bug).
func TestManagerSubmitCallsCreateThenStartExactlyOnce(t *testing.T) {
	rt := &recordingRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 2)

	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if rt.CreateCount != 1 {
		t.Fatalf("expected exactly 1 Create call, got %d", rt.CreateCount)
	}
	rt.mu.Lock()
	starts := rt.startCount
	rt.mu.Unlock()
	if starts != 1 {
		t.Fatalf("expected exactly 1 Start call, got %d", starts)
	}
}
