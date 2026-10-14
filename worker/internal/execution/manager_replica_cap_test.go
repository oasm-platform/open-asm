package execution

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// blockingCreateRuntime holds every Create inside the check-then-create window
// at once, which is exactly where the replica race lived: all Submits passed the
// capacity check (busy=0) before any container was registered, so each spawned
// a container (the 12-nuclei-containers-for-a-cap-of-1 bug).
type blockingCreateRuntime struct {
	*runtime.FakeRuntime
	entered atomic.Int32
	gate    chan struct{}
}

func (b *blockingCreateRuntime) Create(ctx context.Context, spec runtime.JobSpec, opts runtime.RuntimeOpts) (runtime.Handle, error) {
	b.entered.Add(1)
	<-b.gate
	return b.FakeRuntime.Create(ctx, spec, opts)
}

func TestManagerSubmit_ConcurrentSubmitsRespectReplicaCap(t *testing.T) {
	rt := &blockingCreateRuntime{FakeRuntime: runtime.NewFakeRuntime(), gate: make(chan struct{})}
	m := NewManager(rt, 0) // unlimited manager concurrency: the pool is the only gate
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 1, 1))

	const n = 12
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := range n {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			spec := JobSpec{
				Tool:    "nuclei",
				Image:   "ghcr.io/open-asm/nuclei:1.0.0",
				TraceID: fmt.Sprintf("t-%d", i),
			}
			_, errs[i] = m.Submit(context.Background(), spec)
		}(i)
	}

	// Wait until the first Submit is inside Create, then give the rest time to
	// reach the refusal point before releasing the gate.
	deadline := time.Now().Add(2 * time.Second)
	for rt.entered.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond)
	close(rt.gate)
	wg.Wait()

	if got := rt.CreateCount; got != 1 {
		t.Fatalf("created %d containers for maxReplicasPerImage=1, want exactly 1", got)
	}
	ok, exhausted := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, ErrPoolExhausted):
			exhausted++
		default:
			t.Fatalf("unexpected submit error: %v", err)
		}
	}
	if ok != 1 || exhausted != n-1 {
		t.Fatalf("got %d accepted / %d exhausted, want 1 / %d", ok, exhausted, n-1)
	}
}

func agentSpec(i int, limits map[string]any) JobSpec {
	return JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0", Lane: AgentLane, JobID: fmt.Sprintf("agent-%d", i), Limits: limits}
}

// The agent lane is guarded only by the node budget, never the per-image cap.
func TestManagerSubmit_AgentLaneIgnoresReplicaCap(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 0)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 1, 1))
	for i := range 3 {
		if _, err := m.Submit(context.Background(), agentSpec(i, nil)); err != nil {
			t.Fatalf("agent submit %d must ignore max_replicas_per_image=1: %v", i, err)
		}
	}
}

func TestManagerSubmit_AgentLaneRefusedOnNodeBudget(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 0)
	p := NewPoolManager(ConnectorIdleTimeout, 1, 1)
	p.SetResourceBudget(1000, 1*giB)
	m.SetPool(p)
	limits := map[string]any{JobCPUKey: "600m", JobMemoryKey: "256Mi"}
	if _, err := m.Submit(context.Background(), agentSpec(0, limits)); err != nil {
		t.Fatalf("first agent submit: %v", err)
	}
	_, err := m.Submit(context.Background(), agentSpec(1, limits))
	if !errors.Is(err, ErrNodeBudgetExhausted) || !errors.Is(err, ErrPoolExhausted) {
		t.Fatalf("want ErrNodeBudgetExhausted (wrapping ErrPoolExhausted), got %v", err)
	}
}

// Registry lane keeps the cap and reports the replica-cap sentinel, not the budget one.
func TestManagerSubmit_RegistryLaneReplicaCapStillApplies(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 0)
	m.SetPool(NewPoolManager(ConnectorIdleTimeout, 1, 1))
	spec := JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0", JobID: "r-0"}
	if _, err := m.Submit(context.Background(), spec); err != nil {
		t.Fatal(err)
	}
	spec.JobID = "r-1"
	_, err := m.Submit(context.Background(), spec)
	if !errors.Is(err, ErrPoolExhausted) || errors.Is(err, ErrNodeBudgetExhausted) {
		t.Fatalf("want plain ErrPoolExhausted, got %v", err)
	}
}
