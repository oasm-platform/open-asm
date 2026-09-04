package execution

import (
	"context"
	"errors"
	"strings"
	"testing"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/runtime"
)

// Phase 3 replica policy: the pool caps how many busy containers may exist
// per image (MaxReplicasPerImage). A job whose image is at the cap and has no
// idle container is refused with ErrPoolExhausted — Manager creates NO new
// container; the job caller backoffs and retries. Images are independent:
// one image's cap never blocks another. With the pool disabled the cap is
// bypassed entirely (legacy 1:1: every job gets a fresh container).

// 5 jobs of the same image with MaxReplicas=2: exactly 2 containers are
// created; the remaining 3 are refused with ErrPoolExhausted (the caller
// retries later — never a hard Core failure here).
func TestManagerReplicaQuotaLimitsContainersPerImage(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 0)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 2, 1))

	ok, exhausted := 0, 0
	for i := 0; i < 5; i++ {
		_, err := m.Submit(context.Background(), JobSpec{
			Tool:  "nuclei",
			Image: "ghcr.io/open-asm/nuclei:1.0.0",
		})
		switch {
		case err == nil:
			ok++
		case errors.Is(err, ErrPoolExhausted):
			exhausted++
		default:
			t.Fatalf("unexpected submit error: %v", err)
		}
	}
	if ok != 2 {
		t.Fatalf("exactly 2 jobs must be admitted under MaxReplicas=2, got %d", ok)
	}
	if exhausted != 3 {
		t.Fatalf("the 3 excess jobs must get ErrPoolExhausted, got %d", exhausted)
	}
	if got := rt.FakeRuntime.CreateCount; got != 2 {
		t.Fatalf("exactly 2 containers must be created, got %d", got)
	}
}

// The quota is per pool key (image): a different image is never blocked by
// another image's busy containers.
func TestManagerReplicaQuotaDoesNotBlockOtherImages(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 0)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 2, 1))

	for range 2 {
		if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
			t.Fatalf("nuclei job must admit under quota, got %v", err)
		}
	}
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); !errors.Is(err, ErrPoolExhausted) {
		t.Fatalf("third nuclei job must be exhausted, got %v", err)
	}

	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nessus", Image: "ghcr.io/open-asm/nessus:1.0.0"}); err != nil {
		t.Fatalf("a different image must not be blocked by the nuclei cap, got %v", err)
	}
	if got := rt.FakeRuntime.CreateCount; got != 3 {
		t.Fatalf("expected 3 containers (2 nuclei + 1 nessus), got %d", got)
	}
}

// A refused job is NOT lost: once a busy container is released back to idle,
// the next submit of the same image acquires it — no new container is created.
func TestManagerExhaustedThenReleasedReusesIdleContainer(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 0)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 2, 1))

	first, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err != nil {
		t.Fatalf("first submit failed: %v", err)
	}
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
		t.Fatalf("second submit failed: %v", err)
	}
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); !errors.Is(err, ErrPoolExhausted) {
		t.Fatalf("third submit must be exhausted at cap, got %v", err)
	}
	if got := rt.FakeRuntime.CreateCount; got != 2 {
		t.Fatalf("expected 2 containers before release, got %d", got)
	}

	// First execution finishes → its container goes idle → the refused job
	// gets it without creating a third replica.
	if err := m.Release(context.Background(), first); err != nil {
		t.Fatalf("Release failed: %v", err)
	}
	if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
		t.Fatalf("submit after release must reuse the idle container, got %v", err)
	}
	if got := rt.FakeRuntime.CreateCount; got != 2 {
		t.Fatalf("reuse must not create a new container, got %d creates", got)
	}
}

// Pool disabled (legacy 1:1, kill-switch): the replica cap is bypassed —
// every job gets its own container even beyond the configured max.
func TestManagerWithoutPoolIgnoresReplicaQuota(t *testing.T) {
	rt := &captureRuntime{FakeRuntime: runtime.NewFakeRuntime()}
	m := NewManager(rt, 0) // pool nil

	for i := 0; i < 5; i++ {
		if _, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"}); err != nil {
			t.Fatalf("submit %d must succeed without a pool, got %v", i, err)
		}
	}
	if got := rt.FakeRuntime.CreateCount; got != 5 {
		t.Fatalf("legacy 1:1 must create one container per job (5), got %d", got)
	}
}

// Default replica policy (MaxReplicas=1, queue-behind-one): a burst of jobs on
// an empty pool admits exactly ONE container; the excess jobs are refused with
// ErrPoolExhausted and the job.go caller backs off past the exhausted queue
// (never a hard Core failure). When the admitted job finishes, the next submit
// (the backoff retry) acquires THE SAME container — adopt + send on its live
// stream, never queued behind a Register and never a second replica.
func TestManagerBurstQueueBehindSingleReplica(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 4)
	log := &recorderLogger{}
	m.SetLogger(log)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 1, 1)) // MaxReplicasPerImage=1
	proxy := connector.NewProxy()
	m.SetStreamBinder(proxy)
	m.SetEvictor(proxy)
	spec := poolSpec()

	// Burst: 3 jobs of the same image submitted while the pool is empty.
	admitted := ""
	ok, exhausted := 0, 0
	for i := 0; i < 3; i++ {
		id, err := m.Submit(context.Background(), spec)
		switch {
		case err == nil:
			ok++
			admitted = id
		case errors.Is(err, ErrPoolExhausted):
			exhausted++
		default:
			t.Fatalf("unexpected submit error: %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("burst with MaxReplicas=1 must admit exactly 1 job, got %d", ok)
	}
	if exhausted != 2 {
		t.Fatalf("burst excess must yield 2 ErrPoolExhausted, got %d", exhausted)
	}
	if got := rt.CreateCount; got != 1 {
		t.Fatalf("burst must create exactly 1 container, got %d", got)
	}

	// The admitted job's connector registers (container boot) and receives its
	// job on the live stream.
	stream := &fakeConnectStream{}
	if err := proxy.RegisterConnector(admitted, stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if err := proxy.SendExecute(admitted, execJob(admitted, "job-1")); err != nil {
		t.Fatalf("SendExecute exec-1: %v", err)
	}

	// Job 1 finishes cleanly → its container goes back idle for reuse.
	proxy.MarkDone(admitted)
	proxy.OnConnectorDown(admitted)
	m.ReleaseToIdle(admitted)
	proxy.Unregister(admitted)
	if err := m.Release(context.Background(), admitted); err != nil {
		t.Fatalf("Release exec-1: %v", err)
	}
	proxy.OnConnectorDown(admitted)

	// The retried excess job must HIT the same container: no second replica,
	// adopt the live stream, job sent — not queued.
	id2, err := m.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("submit after release must reuse the idle container, got %v", err)
	}
	if err := proxy.SendExecute(id2, execJob(id2, "job-2")); err != nil {
		t.Fatalf("SendExecute exec-2: %v", err)
	}
	if got := rt.CreateCount; got != 1 {
		t.Errorf("queue-behind must not create a second replica (createcount=%d, want 1)", got)
	}
	if !proxy.HasStream(id2) {
		t.Errorf("reuse did not adopt the live stream: HasStream(%s)=false, want true", id2)
	}
	if sent := stream.sentExecutes(); len(sent) != 2 {
		t.Errorf("reuse job was not sent on the adopted stream (sent=%d, want 2 — queued means no adopt)", len(sent))
	}
	if s := log.joined(); !strings.Contains(s, "pool adopt") {
		t.Errorf("adopt outcome was silent: no 'pool adopt' line in manager logs:\n%s", s)
	}
}
