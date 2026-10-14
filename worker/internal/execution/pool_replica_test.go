package execution

import "testing"

// Reservation is the fix for the replica race: a slot must be taken atomically
// before the slow runtime Create, so concurrent Submits cannot each spawn a
// container past the caps. Admission is resource-based (declared container
// limits against the node budget), not a fixed container count.

const (
	miB = 1 << 20
	giB = 1 << 30
)

func TestReserveReplica_PerImageCap(t *testing.T) {
	p := NewPoolManager(ConnectorIdleTimeout, 1, 1)

	if !p.ReserveReplica("exec-1", "nuclei", 500, 512*miB) {
		t.Fatal("first reservation must succeed")
	}
	if p.ReserveReplica("exec-2", "nuclei", 500, 512*miB) {
		t.Fatal("second reservation for the same image must be refused at maxReplicasPerImage=1")
	}
	p.ReleaseReplica("exec-1")
	if !p.ReserveReplica("exec-3", "nuclei", 500, 512*miB) {
		t.Fatal("reservation must be available again after release")
	}
}

func TestReserveReplica_MemoryBudget(t *testing.T) {
	p := NewPoolManager(ConnectorIdleTimeout, 1, 1)
	p.SetResourceBudget(8000, 2*giB) // generous CPU, 2GiB memory

	if !p.ReserveReplica("e1", "a", 500, 1*giB) || !p.ReserveReplica("e2", "b", 500, 1*giB) {
		t.Fatal("two 1GiB requests must fit in a 2GiB budget")
	}
	if p.ReserveReplica("e3", "c", 500, 1*giB) {
		t.Fatal("third 1GiB request must be refused: memory budget exceeded")
	}
	p.ReleaseReplica("e1")
	if !p.ReserveReplica("e4", "d", 500, 1*giB) {
		t.Fatal("request must fit after a release frees memory")
	}
}

func TestReserveReplica_CPUBudget(t *testing.T) {
	p := NewPoolManager(ConnectorIdleTimeout, 1, 1)
	p.SetResourceBudget(1000, 16*giB) // 1 core, plenty of memory

	if !p.ReserveReplica("e1", "a", 500, 100*miB) || !p.ReserveReplica("e2", "b", 500, 100*miB) {
		t.Fatal("two 500m requests must fit in a 1000m budget")
	}
	if p.ReserveReplica("e3", "c", 500, 100*miB) {
		t.Fatal("third 500m request must be refused: cpu budget exceeded")
	}
}

func TestReserveReplica_BusyContainersConsumeBudget(t *testing.T) {
	p := NewPoolManager(ConnectorIdleTimeout, 1, 1)
	p.SetResourceBudget(1000, 1*giB)
	p.Add(poolEntry{ID: "c1", PoolKey: "nuclei", State: PoolStateBusy, CPURequestMillis: 500, MemRequestBytes: 1 * giB})

	if p.ReserveReplica("e", "nuclei", 500, 1*miB) {
		t.Fatal("a busy container must count against the per-image cap")
	}
	if p.ReserveReplica("e", "other", 100, 1*miB) {
		t.Fatal("a busy container's memory must count against the budget")
	}
}

func TestReserveReplica_IdleContainersDoNotConsumeBudget(t *testing.T) {
	p := NewPoolManager(ConnectorIdleTimeout, 1, 1)
	p.SetResourceBudget(500, 1*giB)
	p.Add(poolEntry{ID: "idle-1", PoolKey: "nuclei", State: PoolStateIdle, CPURequestMillis: 500, MemRequestBytes: 1 * giB})

	if !p.ReserveReplica("e", "other", 500, 1*giB) {
		t.Fatal("idle containers must not consume the running budget")
	}
}
