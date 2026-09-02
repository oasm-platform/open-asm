package execution

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// failRuntime wraps FakeRuntime and forces Cancel/Cleanup to fail, simulating a
// broken container engine.
type failRuntime struct {
	*runtime.FakeRuntime
	failCancel  bool
	failCleanup bool
}

func (f *failRuntime) Cancel(ctx context.Context, h runtime.Handle) error {
	if f.failCancel {
		return fmt.Errorf("engine cancel refused")
	}
	return f.FakeRuntime.Cancel(ctx, h)
}

func (f *failRuntime) Cleanup(ctx context.Context, h runtime.Handle) error {
	if f.failCleanup {
		return fmt.Errorf("engine cleanup refused")
	}
	return f.FakeRuntime.Cleanup(ctx, h)
}

// recorderLogger captures error log calls (implements execution.Logger).
type recorderLogger struct {
	mu   sync.Mutex
	msgs []string
}

func (l *recorderLogger) Error(msg string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.msgs = append(l.msgs, fmt.Sprintf(msg, args...))
}

func (l *recorderLogger) ErrorE(msg string, err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.msgs = append(l.msgs, msg+": "+err.Error())
}

func (l *recorderLogger) count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.msgs)
}

func (l *recorderLogger) joined() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.msgs, "\n")
}

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

func TestManagerSubmitPassesConfigAndJobID(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	cfg := map[string]any{"proxy": true, "rateLimit": float64(100)}
	spec := JobSpec{
		Tool:   "nuclei",
		Image:  "ghcr.io/open-asm/nuclei:1.0.0",
		JobID:  "job-abc-123",
		Config: cfg,
	}
	id, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if id == "" {
		t.Fatal("empty id")
	}
	// FakeRuntime should have captured exactly one Create call.
	if len(rt.CreateSpecs) != 1 {
		t.Fatalf("expected 1 Create call, got %d", len(rt.CreateSpecs))
	}
	got := rt.CreateSpecs[0]
	if got.JobID != "job-abc-123" {
		t.Fatalf("expected JobID passthrough 'job-abc-123', got %q", got.JobID)
	}
	if got.Config == nil {
		t.Fatal("expected Config passthrough, got nil")
	}
	if got.Config["proxy"] != true {
		t.Fatalf("expected Config.proxy=true, got %v", got.Config["proxy"])
	}
	if got.Config["rateLimit"] != float64(100) {
		t.Fatalf("expected Config.rateLimit=100, got %v", got.Config["rateLimit"])
	}
}

func TestManagerSubmitNilConfigStaysNil(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	spec := JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}
	_, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	got := rt.CreateSpecs[0]
	if got.Config != nil {
		t.Fatalf("expected nil Config, got %v", got.Config)
	}
}

// Container-engine error logging (task 2): failures must reach the logger, the
// public error returns stay unchanged, healthy runtimes emit nothing.

func TestManagerCancelLogsRuntimeCancelFailure(t *testing.T) {
	rt := &failRuntime{FakeRuntime: runtime.NewFakeRuntime(), failCancel: true}
	m := NewManager(rt, 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel must keep returning nil on runtime failure (logging is additive), got %v", err)
	}
	if rec.count() == 0 {
		t.Fatal("expected an error log for failed runtime Cancel, got none")
	}
	joined := rec.joined()
	if !strings.Contains(joined, "container cancel failed") || !strings.Contains(joined, "engine cancel refused") {
		t.Fatalf("expected log mentioning 'container cancel failed' and the error, got %q", joined)
	}
}

func TestManagerCancelLogsRuntimeCleanupFailure(t *testing.T) {
	rt := &failRuntime{FakeRuntime: runtime.NewFakeRuntime(), failCleanup: true}
	m := NewManager(rt, 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel must keep returning nil on runtime failure (logging is additive), got %v", err)
	}
	if rec.count() == 0 {
		t.Fatal("expected an error log for failed runtime Cleanup, got none")
	}
	joined := rec.joined()
	if !strings.Contains(joined, "container cleanup failed") || !strings.Contains(joined, "engine cleanup refused") {
		t.Fatalf("expected log mentioning 'container cleanup failed' and the error, got %q", joined)
	}
}

func TestManagerOnConnectorDownLogsCleanupFailure(t *testing.T) {
	rt := &failRuntime{FakeRuntime: runtime.NewFakeRuntime(), failCleanup: true}
	m := NewManager(rt, 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if err := m.OnConnectorDown(context.Background(), id); err != nil {
		t.Fatalf("OnConnectorDown failed: %v", err)
	}
	if rec.count() == 0 {
		t.Fatal("expected an error log for failed runtime Cleanup on connector down, got none")
	}
	joined := rec.joined()
	if !strings.Contains(joined, "container cleanup failed") || !strings.Contains(joined, "engine cleanup refused") {
		t.Fatalf("expected log mentioning 'container cleanup failed' and the error, got %q", joined)
	}
}

func TestManagerNilLoggerIsSafe(t *testing.T) {
	rt := &failRuntime{FakeRuntime: runtime.NewFakeRuntime(), failCancel: true, failCleanup: true}
	m := NewManager(rt, 2) // no SetLogger — must not panic
	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel must keep returning nil on runtime failure (logging is additive), got %v", err)
	}
}

func TestManagerTimeoutCancelLogsMissingExecution(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	id, err := m.SubmitWithTimeout(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}, 300*time.Millisecond)
	if err != nil {
		t.Fatalf("SubmitWithTimeout failed: %v", err)
	}
	// Remove the execution before the timer fires so the auto-cancel hits "not found".
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}
	time.Sleep(500 * time.Millisecond)
	if rec.count() == 0 {
		t.Fatal("expected the auto-timeout cancel failure to be logged, got none")
	}
	joined := rec.joined()
	if !strings.Contains(joined, "timeout cancel failed") || !strings.Contains(joined, "not found") {
		t.Fatalf("expected log mentioning 'timeout cancel failed' and 'not found', got %q", joined)
	}
}

func TestManagerHealthyRuntimeEmitsNoErrorLogs(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	id, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if err := m.Cancel(context.Background(), id); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}

	id2, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("second Submit failed: %v", err)
	}
	if err := m.OnConnectorDown(context.Background(), id2); err != nil {
		t.Fatalf("OnConnectorDown failed: %v", err)
	}

	if rec.count() != 0 {
		t.Fatalf("healthy runtime must emit no error logs, got %d: %s", rec.count(), rec.joined())
	}
}
