package execution

// Pool reuse integration tests: Manager + PoolManager + connector.Proxy wired
// exactly like node mode (worker/internal/worker/client.go). These simulate
// the production connector lifecycle end to end with an in-memory stream so the
// warm-pool reuse path is exercised through real BindExec/AdoptStream routing,
// not stubs.

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"

	"google.golang.org/grpc/metadata"

	"oasm-worker/internal/connector"
	pb "oasm-worker/internal/gen/connector"
	"oasm-worker/internal/runtime"
)

// fakeConnectStream is an in-memory pb.ConnectorService_ConnectServer acting as
// the SDK side of the container's connector stream (mirrors the shape used by
// connector/proxy_test.go).
type fakeConnectStream struct {
	mu   sync.Mutex
	sent []*pb.WorkerMessage
}

var _ pb.ConnectorService_ConnectServer = (*fakeConnectStream)(nil)

func (f *fakeConnectStream) Send(m *pb.WorkerMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, m)
	return nil
}

func (f *fakeConnectStream) Recv() (*pb.ConnectorMessage, error) { return nil, nil }
func (f *fakeConnectStream) SetHeader(metadata.MD) error         { return nil }
func (f *fakeConnectStream) SendHeader(metadata.MD) error        { return nil }
func (f *fakeConnectStream) SetTrailer(metadata.MD)              {}
func (f *fakeConnectStream) Context() context.Context            { return context.Background() }
func (f *fakeConnectStream) SendMsg(any) error                   { return nil }
func (f *fakeConnectStream) RecvMsg(any) error                   { return nil }

func (f *fakeConnectStream) sentExecutes() []*pb.ExecuteJob {
	f.mu.Lock()
	defer f.mu.Unlock()
	var jobs []*pb.ExecuteJob
	for _, m := range f.sent {
		if ex := m.GetExecute(); ex != nil {
			jobs = append(jobs, ex)
		}
	}
	return jobs
}

// gateRuntime wraps FakeRuntime with a Start gate: Start blocks until release
// is closed. This opens the window where the container's connector dials back
// and registers BEFORE Manager.Submit reaches BindExec — the boot race seen in
// production (registrations landing under an "adhoc-<exec>" proxy key).
type gateRuntime struct {
	*runtime.FakeRuntime
	startOnce sync.Once
	started   chan struct{} // closed once Start is entered (race window open)
	release   chan struct{} // Start returns once closed
}

func (g *gateRuntime) Start(context.Context, runtime.Handle) error {
	// Only the FIRST Start opens the race window; later Starts (fresh-create
	// fallback in the broken code path) pass through the already-closed gate.
	g.startOnce.Do(func() { close(g.started) })
	<-g.release
	return nil
}

// poolSpec is the shared JobSpec for all jobs in these tests (same image →
// same pool key, warm-pool reuse eligible).
func poolSpec() JobSpec {
	return JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0", Inputs: map[string]any{"target": "https://example.com"}}
}

func execJob(id, jobID string) *pb.ExecuteJob {
	return &pb.ExecuteJob{ExecutionId: id, JobId: jobID, Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}
}

// newPooledManager wires Manager + real PoolManager + real connector.Proxy (as
// node mode does) around rt, returning all pieces the test drives.
func newPooledManager(t *testing.T, rt runtime.ExecutionRuntime) (*Manager, *PoolManager, *connector.Proxy, *recorderLogger) {
	t.Helper()
	m := NewManager(rt, 4)
	log := &recorderLogger{}
	m.SetLogger(log)
	pool := NewPoolManager(ConnectorIdleTimeout, 3, 1)
	m.SetPool(pool)
	proxy := connector.NewProxy()
	m.SetStreamBinder(proxy)
	m.SetEvictor(proxy)
	return m, pool, proxy, log
}

// ---------------------------------------------------------------------------
// Boot-race reuse: this is the E2E mystery. The container's connector registers
// in the window between rt.Start and BindExec, so the proxy keys the stream
// under "adhoc-<exec>" and the container is NEVER mapped under its real ID.
// The next Submit must reuse the idle container and adopt its live stream —
// before the fix it misses, silently evicts the container (orphan!) and
// creates a replica instead.
// ---------------------------------------------------------------------------
func TestManagerPoolReuseWithConnectorBootRace(t *testing.T) {
	rt := &gateRuntime{FakeRuntime: runtime.NewFakeRuntime(), started: make(chan struct{}), release: make(chan struct{})}
	m, pool, proxy, log := newPooledManager(t, rt)
	spec := poolSpec()

	// exec-1 Submit blocks inside Start — the boot race window.
	submitErr := make(chan error, 1)
	go func() {
		_, err := m.Submit(context.Background(), spec)
		submitErr <- err
	}()
	<-rt.started

	// The connector dials back NOW, before the manager has bound the exec to
	// its container (production: connector server → proxy.RegisterConnector).
	stream := &fakeConnectStream{}
	if err := proxy.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector during boot race must succeed: %v", err)
	}
	close(rt.release)
	if err := <-submitErr; err != nil {
		t.Fatalf("Submit exec-1: %v", err)
	}

	// Server Done branch (stream stays OPEN; pool notified to idle the container).
	proxy.MarkDone("exec-1")
	proxy.OnConnectorDown("exec-1")
	m.ReleaseToIdle("exec-1")

	// Drain end: unbind the finished execution, keep the container warm.
	proxy.Unregister("exec-1")
	if err := m.Release(context.Background(), "exec-1"); err != nil {
		t.Fatalf("Release exec-1: %v", err)
	}
	proxy.OnConnectorDown("exec-1")

	// Job 2, same image: must reuse the idle container and adopt its stream.
	id2, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit exec-2: %v", err)
	}
	if err := proxy.SendExecute(id2, execJob(id2, "job-2")); err != nil {
		t.Fatalf("SendExecute exec-2: %v", err)
	}

	// 1) Reuse must NOT create a second replica container.
	if got := rt.CreateCount; got != 1 {
		t.Errorf("REUSE-MISS (root cause): boot race prevents adopt, second Submit created a replica (createcount=%d, want 1)", got)
	}
	// 2) The adopted stream must now be routable for the new execution.
	if !proxy.HasStream(id2) {
		t.Errorf("reuse did not adopt the live stream: HasStream(%s)=false, want true", id2)
	}
	// 3) The job must go out on the adopted stream (sent), never queued.
	if sent := stream.sentExecutes(); len(sent) != 1 {
		t.Errorf("reuse job was not sent on the adopted stream (sent=%d, want 1 — queued means no adopt)", len(sent))
	}
	// 4) The reused container must still be tracked by the pool (not an orphan).
	if _, ok := pool.byID["fake-1"]; !ok {
		t.Errorf("pool lost the reused container fake-1 on adopt failure (orphan leaked, sweeper blind)")
	}
	// 5) The adopt outcome must be logged (mandatory observability).
	if s := log.joined(); !strings.Contains(s, "pool adopt") {
		t.Errorf("adopt outcome was silent: no 'pool adopt' line in manager logs:\n%s", s)
	}
}

// ---------------------------------------------------------------------------
// Clean-order regression guard: when the connector registers AFTER BindExec
// (the normal fast path) reuse must work BEFORE and AFTER the fix. Guards the
// fix against breaking the working path.
// ---------------------------------------------------------------------------
func TestManagerPoolReuseCleanOrder(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m, _, proxy, _ := newPooledManager(t, rt)
	spec := poolSpec()

	id1, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit exec-1: %v", err)
	}
	// Connector registers after Submit returned (BindExec already ran).
	stream := &fakeConnectStream{}
	if err := proxy.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if err := proxy.SendExecute(id1, execJob(id1, "job-1")); err != nil {
		t.Fatalf("SendExecute exec-1: %v", err)
	}

	proxy.MarkDone("exec-1")
	proxy.OnConnectorDown("exec-1")
	m.ReleaseToIdle("exec-1")
	proxy.Unregister("exec-1")
	if err := m.Release(context.Background(), "exec-1"); err != nil {
		t.Fatalf("Release exec-1: %v", err)
	}
	proxy.OnConnectorDown("exec-1")

	id2, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit exec-2: %v", err)
	}
	if err := proxy.SendExecute(id2, execJob(id2, "job-2")); err != nil {
		t.Fatalf("SendExecute exec-2: %v", err)
	}

	if got := rt.CreateCount; got != 1 {
		t.Errorf("clean-order reuse must not create a replica (createcount=%d, want 1)", got)
	}
	if !proxy.HasStream(id2) {
		t.Errorf("HasStream(%s)=false, want true", id2)
	}
	if sent := stream.sentExecutes(); len(sent) != 2 {
		t.Errorf("both jobs must be sent on the same stream (sent=%d, want 2)", len(sent))
	}
}

// ---------------------------------------------------------------------------
// Mandatory orphan cleanup: an adopt failure (container has no live stream —
// dead container or boot race) evicts the container from the pool. The fix must
// ALSO Stop+Cleanup it on a detached context, so no up-forever orphan escapes
// the sweeper. Before the fix this test is RED: the evicted fake-1 is never
// cancelled and never cleaned up.
// ---------------------------------------------------------------------------

// failBinder accepts every execution but never adopts: AdoptStream always fails
// ("container has no live stream"), forcing the manager's adopt-fail fallback.
type failBinder struct{}

func (b *failBinder) BindExec(execID, containerID string) {}
func (b *failBinder) ReleaseExec(execID string)           {}
func (b *failBinder) AdoptStream(containerID, newExecID string) error {
	return fmt.Errorf("adopt stream: container %s has no live stream", containerID)
}

// recordEvictor records RemoveContainer calls.
type recordEvictor struct {
	mu      sync.Mutex
	removed []string
}

func (e *recordEvictor) RemoveContainer(containerID string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.removed = append(e.removed, containerID)
}

func (e *recordEvictor) removedContainers() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]string(nil), e.removed...)
}

func TestManagerAdoptFailOrphanIsStoppedAndCleaned(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 4)
	log := &recorderLogger{}
	m.SetLogger(log)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 3, 1))
	m.SetStreamBinder(&failBinder{})
	evictor := &recordEvictor{}
	m.SetEvictor(evictor)
	spec := poolSpec()

	id1, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit exec-1: %v", err)
	}
	m.ReleaseToIdle(id1)
	if err := m.Release(context.Background(), id1); err != nil {
		t.Fatalf("Release exec-1: %v", err)
	}

	// Reuse hit on fake-1 → adopt fails → orphan container must be torn down.
	id2, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("Submit exec-2: %v", err)
	}
	if id2 == "" {
		t.Fatal("empty exec id")
	}

	cancelled := false
	for _, c := range rt.CancelCalls {
		if c == "fake-1" {
			cancelled = true
		}
	}
	if !cancelled {
		t.Errorf("ORPHAN LEAK: evicted container fake-1 was never Stop()'d (CancelCalls=%v)", rt.CancelCalls)
	}
	if removed := evictor.removedContainers(); len(removed) != 1 || removed[0] != "fake-1" {
		t.Errorf("RemoveContainer must drop the failed container (got %v)", removed)
	}
	joined := log.joined()
	if !strings.Contains(joined, "pool adopt failed") {
		t.Errorf("adopt failure must be logged as its own error line:\n%s", joined)
	}
	if !strings.Contains(joined, "pool evict: container fake-1 removed (adopt failed)") {
		t.Errorf("adopt-fail evict line missing:\n%s", joined)
	}
	// Fallback replica is created afterward — exhausted-backoff/quota unchanged.
	if got := rt.CreateCount; got != 2 {
		t.Errorf("adopt-fail must fall back to a fresh replica (createcount=%d, want 2)", got)
	}
	if _, ok := m.pool.byID["fake-2"]; !ok {
		t.Errorf("fallback replica fake-2 must be tracked (busy)")
	}
}
