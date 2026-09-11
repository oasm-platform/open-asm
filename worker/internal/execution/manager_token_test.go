package execution

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"oasm-worker/internal/runtime"
)

// Per-execution connector tokens: Submit mints a single-use token BEFORE the
// container is created (spec.ConnectorToken reaches rt.Create, and Manager
// remembers it immediately — closing the early-connect race where a fast
// connector dials back before token registration). Release/Cancel delete the
// token (single-use lifecycle). The token value is never logged.

// failCreateRuntime forces Create to fail so token-leak behavior on the error
// path can be asserted.
type failCreateRuntime struct {
	*runtime.FakeRuntime
}

func (f *failCreateRuntime) Create(ctx context.Context, spec runtime.JobSpec, opts runtime.RuntimeOpts) (runtime.Handle, error) {
	return runtime.Handle{}, context.DeadlineExceeded
}

func TestSubmitRegistersConnectorTokenBeforeCreate(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)

	id, err := m.Submit(context.Background(), JobSpec{
		Tool:   "nuclei",
		Image:  "ghcr.io/open-asm/nuclei:1.0.0",
		Limits: map[string]any{JobTimeoutSecondsKey: 600},
	})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if id != "exec-1" {
		t.Fatalf("id = %q, want exec-1", id)
	}

	// The spec that reached the runtime must carry the token...
	if len(rt.CreateSpecs) != 1 || rt.CreateSpecs[0].ConnectorToken == "" {
		t.Fatalf("expected one Create with a non-empty ConnectorToken, got %+v", rt.CreateSpecs)
	}
	specToken := rt.CreateSpecs[0].ConnectorToken
	// ...and the manager must have it registered before returning.
	tok, ok := m.ExecToken(id)
	if !ok {
		t.Fatal("expected per-execution token registered after Submit")
	}
	if tok != specToken {
		t.Fatalf("ExecToken(%s) = %q, want the token passed to Create %q", id, tok, specToken)
	}
	// 32 random bytes → 64 hex chars.
	if utf8.RuneCountInString(tok) != 64 {
		t.Fatalf("token length = %d, want 64 hex chars (32 random bytes)", utf8.RuneCountInString(tok))
	}
}

func TestReleaseDeletesConnectorToken(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, ok := m.ExecToken(id); !ok {
		t.Fatal("expected token before Release")
	}
	if err := m.Release(context.Background(), id); err != nil {
		t.Fatalf("Release: %v", err)
	}
	if _, ok := m.ExecToken(id); ok {
		t.Fatal("token must be deleted after Release (single-use)")
	}
}

func TestCancelDeletesConnectorToken(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, ok := m.ExecToken(id); !ok {
		t.Fatal("expected token before Cancel")
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if _, ok := m.ExecToken(id); ok {
		t.Fatal("token must be deleted after Cancel (single-use)")
	}
}

func TestSubmitDoesNotLeakTokenOnCreateFailure(t *testing.T) {
	m := NewManager(&failCreateRuntime{FakeRuntime: runtime.NewFakeRuntime()}, 2)
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err == nil {
		t.Fatal("expected Submit error from failing runtime")
	}
	if _, ok := m.ExecToken("exec-1"); ok {
		t.Fatal("token must not leak when container create fails")
	}
	if m.ActiveCount() != 0 {
		t.Fatalf("ActiveCount = %d, want 0", m.ActiveCount())
	}
}

// ContainerDown (connector stream died) is a terminal teardown: the single-use
// token must die with the execution, in pool and non-pool mode alike.
func TestContainerDownDeletesConnectorToken(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 3, 1))
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, ok := m.ExecToken(id); !ok {
		t.Fatal("expected token before ContainerDown")
	}
	m.ContainerDown(id)
	if _, ok := m.ExecToken(id); ok {
		t.Fatal("token must be deleted after ContainerDown (single-use)")
	}
	if rt.CancelCallCount() != 1 {
		t.Fatalf("expected the evicted container to be stopped once, got %d cancels", rt.CancelCallCount())
	}
}

func TestContainerDownDeletesTokenWithoutPool(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	m.ContainerDown(id)
	if _, ok := m.ExecToken(id); ok {
		t.Fatal("token must be deleted after ContainerDown even when the pool is disabled")
	}
}

// Defensive sweep path: a swept entry that still names an execution must have
// that execution's token dropped with it.
func TestSweepContainerDropsTokenOfNamedExecution(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	m.tokens["exec-x"] = "tok-x"
	m.sweepContainer(poolEntry{ID: "fake-1", PoolKey: "nuclei", ExecID: "exec-x"})
	if _, ok := m.ExecToken("exec-x"); ok {
		t.Fatal("token must be deleted when its execution's container is swept")
	}
}

// Submit must never log the token itself — only a token_set flag. The
// recorderLogger content is the assertion surface.
func TestSubmitLogsTokenSetOnly(t *testing.T) {
	rec := &recorderLogger{}
	m := NewManager(runtime.NewFakeRuntime(), 2)
	m.SetLogger(rec)

	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	tok, _ := m.ExecToken(id)

	joined := rec.joined()
	if !strings.Contains(joined, "token_set=true") {
		t.Fatalf("expected token_set=true in log, got %q", joined)
	}
	if strings.Contains(joined, tok) {
		t.Fatalf("token value must never be logged, got %q", joined)
	}
}
