package worker

import (
	"context"
	"sync"
	"testing"
	"time"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	connectorpb "oasm-worker/internal/gen/connector"
	"oasm-worker/internal/runtime"
)

// recordedCtx snapshots a context's state at the moment the runtime received
// it. Snapshotting Err()/deadline immediately is what proves the cleanup call
// itself saw a detached context — the caller may cancel() the ctx right after
// the call returns, which would cancel the same object by the time the test
// asserts.
type recordedCtx struct {
	err   error
	dl    time.Time
	hasDL bool
}

// ctxRecordingRuntime wraps FakeRuntime and records the contexts passed to
// Cancel/Cleanup so tests can prove cleanup runs on a detached context (never
// the session ctx, which a worker reconnect may cancel).
type ctxRecordingRuntime struct {
	*runtime.FakeRuntime
	mu          sync.Mutex
	cancelCtxs  []recordedCtx
	cleanupCtxs []recordedCtx
}

func (r *ctxRecordingRuntime) record(ctx context.Context, list *[]recordedCtx) {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := ctx.Deadline()
	*list = append(*list, recordedCtx{err: ctx.Err(), dl: d, hasDL: ok})
}

func (r *ctxRecordingRuntime) Cancel(ctx context.Context, h runtime.Handle) error {
	r.record(ctx, &r.cancelCtxs)
	return r.FakeRuntime.Cancel(ctx, h)
}

func (r *ctxRecordingRuntime) Cleanup(ctx context.Context, h runtime.Handle) error {
	r.record(ctx, &r.cleanupCtxs)
	return r.FakeRuntime.Cleanup(ctx, h)
}

func (r *ctxRecordingRuntime) snapshot() (cancelCtxs, cleanupCtxs []recordedCtx) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cancelCtxs = append([]recordedCtx(nil), r.cancelCtxs...)
	cleanupCtxs = append([]recordedCtx(nil), r.cleanupCtxs...)
	return cancelCtxs, cleanupCtxs
}

// assertDetachedContexts verifies every recorded context was fresh and
// deadline-bounded at call time (context.WithTimeout(Background, ~30s)) —
// i.e. it was NOT the (possibly cancelled) session context.
func assertDetachedContexts(t *testing.T, label string, ctxs []recordedCtx) {
	t.Helper()
	if len(ctxs) == 0 {
		t.Fatalf("%s: expected at least one recorded context", label)
	}
	for i, c := range ctxs {
		if c.err != nil {
			t.Fatalf("%s[%d]: expected detached (un-cancelled) context at call time, got Err()=%v", label, i, c.err)
		}
		if !c.hasDL {
			t.Fatalf("%s[%d]: expected a context with a deadline, got none", label, i)
		}
		if rem := time.Until(c.dl); rem < 20*time.Second {
			t.Fatalf("%s[%d]: deadline too tight: %v remaining (want ~30s cleanup budget)", label, i, rem)
		}
	}
}

// Timeout path: the connector never connects, the session ctx was already
// cancelled (worker reconnect). Container Cancel/Cleanup must still run on a
// DETACHED context — a cancelled session ctx would abort the docker calls and
// orphan the container.
func TestHandleConnectorResultTimeoutUsesDetachedContext(t *testing.T) {
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, _, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	rt := &ctxRecordingRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	mgr := execution.NewManager(rt, 0)
	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei"})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}

	entry := &bridgeEntry{jobID: "job-detach-t", category: "subdomains", release: func() {}}
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)
	activeJobsMu.Lock()
	activeJobs[entry.jobID] = struct{}{}
	activeJobsMu.Unlock()

	// The session context arrives already cancelled (a reconnect cancelled it).
	sessionCtx, sessionCancel := context.WithCancel(context.Background())
	sessionCancel()

	done := make(chan struct{})
	go func() {
		handleConnectorResult(sessionCtx, execID, client, events, proxy, resultCh, time.Now(), 50*time.Millisecond, mgr, nil)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult connect timeout")
	}

	cancelCtxs, cleanupCtxs := rt.snapshot()
	assertDetachedContexts(t, "cancel", cancelCtxs)
	assertDetachedContexts(t, "cleanup", cleanupCtxs)

	if got := mgr.ActiveCount(); got != 0 {
		t.Fatalf("expected execution removed from Manager after timeout, ActiveCount=%d", got)
	}
}

// Normal completion path: after the channel closes (Done), the container must
// be cleaned up via Manager.OnConnectorDown on a detached context.
func TestHandleConnectorResultDoneCleansUpContainer(t *testing.T) {
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, _, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	rt := &ctxRecordingRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	mgr := execution.NewManager(rt, 0)
	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei"})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}

	entry := &bridgeEntry{jobID: "job-detach-d", category: "subdomains", release: func() {}}
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, mgr, nil)
		close(done)
	}()

	// Normal flow: result chunk, then Done, then connector-down (channel close).
	proxy.ForwardResult(execID, []byte(`{"a":1}`), nil)
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	cancelCtxs, cleanupCtxs := rt.snapshot()
	if len(cancelCtxs) != 0 {
		t.Fatalf("Done path must not call Manager.Cancel, got %d calls", len(cancelCtxs))
	}
	assertDetachedContexts(t, "cleanup", cleanupCtxs)

	if got := mgr.ActiveCount(); got != 0 {
		t.Fatalf("expected execution removed from Manager after done, ActiveCount=%d", got)
	}
}

// Pending cleanup: an ExecuteJob queued before the connector connected must be
// dropped when the execution finishes (channel closed without ever flushing).
// A late registration must not resurrect it.
func TestHandleConnectorResultDoneClearsPendingExecute(t *testing.T) {
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, _, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	execID := "exec-pending-1"
	// Queue the ExecuteJob before the connector ever connects.
	if err := proxy.SendExecute(execID, &connectorpb.ExecuteJob{ExecutionId: execID, JobId: "job-p", Tool: "nuclei"}); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}

	entry := &bridgeEntry{jobID: "job-p", category: "subdomains", release: func() {}}
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Connector crashed without ever registering: channel closed directly.
	close(resultCh)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	// A late stream registration must not flush the dropped pending job.
	stream := &captureStream{}
	if err := proxy.RegisterConnector(execID, stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if n := len(stream.executes()); n != 0 {
		t.Fatalf("expected 0 flushed ExecuteJobs after completion, got %d (pending must not leak)", n)
	}
}
