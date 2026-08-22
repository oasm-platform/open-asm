package execution

import (
	"context"
	"strings"
	"testing"

	"oasm-worker/internal/runtime"
)

func TestManagerSubmitAndCancel(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0", Inputs: map[string]any{"target": "https://example.com"}})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if id == "" {
		t.Fatal("empty id")
	}
	if m.ActiveCount() != 1 {
		t.Fatalf("expected 1 active, got %d", m.ActiveCount())
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}
	if m.ActiveCount() != 0 {
		t.Fatalf("expected 0 after cancel, got %d", m.ActiveCount())
	}
}

func TestManagerIDsDoNotCollideAfterCancel(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 10)
	spec := JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}
	ctx := context.Background()

	id1, err := m.Submit(ctx, spec)
	if err != nil {
		t.Fatalf("first Submit failed: %v", err)
	}
	id2, err := m.Submit(ctx, spec)
	if err != nil {
		t.Fatalf("second Submit failed: %v", err)
	}
	if err := m.Cancel(ctx, id1); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}
	id3, err := m.Submit(ctx, spec)
	if err != nil {
		t.Fatalf("third Submit failed after cancel: %v", err)
	}

	// Third submission must not reuse the still-active second execution's ID.
	if id3 == id2 {
		t.Fatalf("ID collision: third exec %q overwrites active exec %q", id3, id2)
	}
	seen := map[string]bool{id1: true, id2: true, id3: true}
	if len(seen) != 3 {
		t.Fatalf("expected 3 distinct IDs, got %v", []string{id1, id2, id3})
	}
	// Two executions still active (id1 cancelled, id2+id3 running).
	if got := m.ActiveCount(); got != 2 {
		t.Fatalf("expected ActiveCount=2, got %d", got)
	}
}

func TestManagerEnforcesConcurrency(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 1)
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
		t.Fatalf("first Submit failed: %v", err)
	}
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err == nil {
		t.Fatal("expected concurrency error")
	} else if !strings.Contains(strings.ToLower(err.Error()), "max concurrency") {
		t.Fatalf("expected max concurrency error, got %v", err)
	}
}
