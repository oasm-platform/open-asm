package execution

import (
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// W2 shutdown drain: workerCancel() only stops the SweepLoop, which would
// otherwise leak every idle pooled container past the idle timeout. DrainPool
// must force-collect and tear down ALL idle containers regardless of age.
func TestDrainPoolStopsIdleContainers(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	p := NewPoolManager(ConnectorIdleTimeout, 3, 1)
	m.SetPool(p)
	p.Add(poolEntry{ID: "c1", Image: "nuclei", PoolKey: "nuclei", State: PoolStateIdle, LastUsedAt: time.Now()})

	m.DrainPool()

	if len(p.byID) != 0 {
		t.Fatalf("pool must be empty after DrainPool, got %d entries", len(p.byID))
	}
	if len(p.owner) != 0 {
		t.Fatalf("owner map must be empty after DrainPool, got %d entries", len(p.owner))
	}
	if rt.CancelCallCount() != 1 {
		t.Fatalf("DrainPool must stop the idle container once, got %d cancel calls", rt.CancelCallCount())
	}
}

// A busy container carries a live execution: shutdown drain must NOT touch it.
func TestDrainPoolKeepsBusyContainer(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	m := NewManager(rt, 2)
	p := NewPoolManager(ConnectorIdleTimeout, 3, 1)
	m.SetPool(p)
	p.Add(poolEntry{ID: "c1", Image: "nuclei", PoolKey: "nuclei", State: PoolStateBusy, ExecID: "exec-1", LastUsedAt: time.Now()})

	m.DrainPool()

	if len(p.byID) != 1 {
		t.Fatalf("busy container must survive DrainPool, got %d entries", len(p.byID))
	}
	if rt.CancelCallCount() != 0 {
		t.Fatalf("DrainPool must not stop busy containers, got %d cancel calls", rt.CancelCallCount())
	}
}

// DrainPool without a pool is a no-op (legacy 1:1 worker shutdown path).
func TestDrainPoolWithoutPoolIsNoOp(t *testing.T) {
	m := NewManager(runtime.NewFakeRuntime(), 2)
	m.DrainPool() // must not panic
}
