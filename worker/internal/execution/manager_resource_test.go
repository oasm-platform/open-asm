package execution

import (
	"context"
	"strings"
	"testing"

	"oasm-worker/internal/runtime"
)

// captureRuntime wraps FakeRuntime and records the RuntimeOpts passed to
// Create — FakeRuntime itself discards them (CreateSpecs has no opts).
type captureRuntime struct {
	*runtime.FakeRuntime
	opts []runtime.RuntimeOpts
}

func (c *captureRuntime) Create(ctx context.Context, spec runtime.JobSpec, opts runtime.RuntimeOpts) (runtime.Handle, error) {
	c.opts = append(c.opts, opts)
	return c.FakeRuntime.Create(ctx, spec, opts)
}

// The scheduling context (core-api) attaches manifest resource defaults to the
// job. Submit must translate spec.Limits into runtime.RuntimeOpts so the
// Docker HostConfig receives real CPU/memory values.
func TestManagerSubmitPassesManifestLimitsToRuntime(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 2)

	spec := JobSpec{
		Tool:    "nuclei",
		Image:   "ghcr.io/open-asm/nuclei:1.0.0",
		TraceID: "trace-abc-123",
		Limits: map[string]any{
			JobCPUKey:            "500m",
			JobMemoryKey:         "512Mi",
			JobTimeoutSecondsKey: 600,
		},
	}
	if _, err := m.Submit(context.Background(), spec); err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	if len(rt.opts) != 1 {
		t.Fatalf("expected 1 Create call, got %d", len(rt.opts))
	}
	got := rt.opts[0]
	if got.CPU != 500 {
		t.Fatalf("expected CPU 500 millicores, got %d", got.CPU)
	}
	if got.Memory != 536870912 {
		t.Fatalf("expected Memory 536870912 bytes (512Mi), got %d", got.Memory)
	}
	if got.TimeoutSeconds != 600 {
		t.Fatalf("expected TimeoutSeconds 600, got %d", got.TimeoutSeconds)
	}
	if got.TraceID != "trace-abc-123" {
		t.Fatalf("expected TraceID passthrough 'trace-abc-123', got %q", got.TraceID)
	}
}

// Legacy jobs (and built-in tools without a manifest entry) carry no Limits.
// They must keep running unlimited — CPU=0/Memory=0 in Docker terms.
func TestManagerSubmitWithoutLimitsRunsUnlimited(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 2)

	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	got := rt.opts[0]
	if got.CPU != 0 || got.Memory != 0 || got.TimeoutSeconds != 0 {
		t.Fatalf("expected unlimited legacy opts (CPU=0 Memory=0 Timeout=0), got %+v", got)
	}
}

// Contract: a malformed limit value must NEVER fail the job. Submit succeeds,
// the container runs unlimited and a warning is logged (Info, not Error).
func TestManagerSubmitInvalidMemoryFallsBackToUnlimited(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	spec := JobSpec{
		Tool:    "nuclei",
		Image:   "ghcr.io/open-asm/nuclei:1.0.0",
		TraceID: "trace-bad-1",
		Limits: map[string]any{
			JobCPUKey:            "500m",
			JobMemoryKey:         "9999Bogus",
			JobTimeoutSecondsKey: 600,
		},
	}
	if _, err := m.Submit(context.Background(), spec); err != nil {
		t.Fatalf("Submit must not fail on invalid limits, got %v", err)
	}
	if len(rt.opts) != 1 {
		t.Fatalf("expected 1 Create call, got %d", len(rt.opts))
	}
	got := rt.opts[0]
	if got.CPU != 0 || got.Memory != 0 {
		t.Fatalf("expected unlimited fallback (CPU=0 Memory=0), got %+v", got)
	}
	if got.TraceID != "trace-bad-1" {
		t.Fatalf("expected TraceID preserved on fallback, got %q", got.TraceID)
	}
	if rec.errorCount() != 0 {
		t.Fatalf("fallback must not log an error, got: %s", rec.joined())
	}
	joined := rec.joined()
	if !strings.Contains(joined, "resource") || !strings.Contains(joined, "unlimited") {
		t.Fatalf("expected warning mentioning 'resource' and 'unlimited', got %q", joined)
	}
}

// A job with cpu/mem limits and timeoutSeconds=0 (no job-level timeout, e.g.
// timed by the API or by the connector itself) must still receive Docker CPU
// and memory limits — timeout=0 is NOT a reason to fall back to unlimited.
func TestManagerSubmitZeroTimeoutStillAppliesCpuAndMemory(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 2)
	rec := &recorderLogger{}
	m.SetLogger(rec)

	spec := JobSpec{
		Tool:    "nuclei",
		Image:   "ghcr.io/open-asm/nuclei:1.0.0",
		TraceID: "trace-zero-timeout",
		Limits: map[string]any{
			JobCPUKey:            "500m",
			JobMemoryKey:         "512Mi",
			JobTimeoutSecondsKey: 0,
		},
	}
	if _, err := m.Submit(context.Background(), spec); err != nil {
		t.Fatalf("Submit must not fail on timeout=0, got %v", err)
	}
	if len(rt.opts) != 1 {
		t.Fatalf("expected 1 Create call, got %d", len(rt.opts))
	}
	got := rt.opts[0]
	if got.CPU != 500 {
		t.Fatalf("expected CPU 500 millicores, got %d", got.CPU)
	}
	if got.Memory != 536870912 {
		t.Fatalf("expected Memory 536870912 bytes (512Mi), got %d", got.Memory)
	}
	if got.TimeoutSeconds != 0 {
		t.Fatalf("expected TimeoutSeconds 0, got %d", got.TimeoutSeconds)
	}
	if rec.errorCount() != 0 {
		t.Fatalf("timeout=0 fallback must not log an error, got: %s", rec.joined())
	}
	if joined := rec.joined(); strings.Contains(joined, "unlimited") {
		t.Fatalf("expected NO 'unlimited' warning when cpu/mem are valid, got %q", joined)
	}
}

// A Limits map containing only the timeout key (no cpu/memory) keeps the
// legacy unlimited runtime opts — the timeout is enforced separately by the
// auto-cancel timer.
func TestManagerSubmitTimeoutOnlyKeepsUnlimitedOpts(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 2)

	spec := JobSpec{
		Tool:   "nuclei",
		Image:  "ghcr.io/open-asm/nuclei:1.0.0",
		Limits: map[string]any{JobTimeoutSecondsKey: 600},
	}
	if _, err := m.Submit(context.Background(), spec); err != nil {
		t.Fatalf("Submit failed: %v", err)
	}
	got := rt.opts[0]
	if got.CPU != 0 || got.Memory != 0 || got.TimeoutSeconds != 0 {
		t.Fatalf("expected unlimited opts for timeout-only limits, got %+v", got)
	}
}
