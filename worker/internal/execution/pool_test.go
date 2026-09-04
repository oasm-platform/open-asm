package execution

import (
	"testing"
	"time"
)

// PoolManager is pure in-memory state; tests drive it with a fake clock so the
// 60s idle expiry is deterministic instead of sleeping.

func newPoolForTest(t *testing.T, now time.Time) (*PoolManager, time.Time) {
	t.Helper()
	p := NewPoolManager(ConnectorIdleTimeout, 3, 1)
	p.now = func() time.Time { return now }
	return p, now
}

func idleEntry(cid, key string, lastUsed time.Time) poolEntry {
	// poolEntry construction: containers are recorded via Add after creation.
	return poolEntry{
		ID:         cid,
		Image:      key,
		PoolKey:    key,
		State:      PoolStateIdle,
		LastUsedAt: lastUsed,
	}
}

func TestPoolAcquireIdleContainerMarksBusy(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now))

	cid, ok := p.Acquire("exec-1", "nuclei")
	if !ok {
		t.Fatal("Acquire must hit an idle container with a matching pool key")
	}
	if cid != "c1" {
		t.Fatalf("Acquire returned %q, want c1", cid)
	}
	if p.IsIdle("exec-1") {
		t.Fatal("acquired container must not be idle")
	}
}

func TestPoolAcquireMissingKeyMisses(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now))

	if _, ok := p.Acquire("exec-1", "nessus"); ok {
		t.Fatal("Acquire must miss when no idle container has the key")
	}
}

func TestPoolAcquireSkipsBusyContainer(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now))
	p.Acquire("exec-1", "nuclei")

	cid, ok := p.Acquire("exec-2", "nuclei")
	if ok {
		t.Fatalf("Acquire must not reuse a busy container (MaxJobsPerContainer=1), got %q", cid)
	}
}

func TestPoolReleaseToIdleReusesSameContainer(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now))
	cid, _ := p.Acquire("exec-1", "nuclei")

	p.ReleaseToIdle("exec-1")
	if !p.IsIdle("exec-1") {
		t.Fatal("ReleaseToIdle must return the container to idle")
	}

	cid2, ok := p.Acquire("exec-2", "nuclei")
	if !ok {
		t.Fatal("released container must be acquirable by the next execution")
	}
	if cid2 != cid {
		t.Fatalf("second acquire got %q, want same container %q", cid2, cid)
	}
}

func TestPoolSweepCollectsExpiredIdleOnly(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	// Acquire pops the OLDEST idle container first — add the one that must
	// end up busy FIRST so it is the one acquired.
	p.Add(idleEntry("busy", "nuclei", now.Add(-2*ConnectorIdleTimeout)))
	p.Add(idleEntry("fresh", "nuclei", now.Add(-10*time.Second)))
	p.Add(idleEntry("stale", "nuclei", now.Add(-2*ConnectorIdleTimeout)))
	p.Acquire("exec-busy", "nuclei") // busy container must survive the sweep

	expired := p.Sweep(now)
	found := map[string]bool{}
	for _, e := range expired {
		found[e.ID] = true
	}
	if !found["stale"] {
		t.Fatal("Sweep must evict an idle container past the idle timeout")
	}
	if found["fresh"] {
		t.Fatal("Sweep must keep an idle container within the idle timeout")
	}
	if found["busy"] {
		t.Fatal("Sweep must never evict a busy container")
	}
}

func TestPoolSweepFiresExactlyAtTimeout(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now.Add(-ConnectorIdleTimeout)))

	expired := p.Sweep(now)
	if len(expired) != 1 {
		t.Fatalf("idle exactly at the timeout must be evicted, got %d", len(expired))
	}
}

func TestPoolEvictRemovesContainer(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now))
	p.Acquire("exec-1", "nuclei")

	p.Evict("exec-1")
	if _, ok := p.Acquire("exec-2", "nuclei"); ok {
		t.Fatal("evicted container must not be acquirable")
	}
}

func TestPoolBusyCountTracksPerKey(t *testing.T) {
	now := time.Now()
	p, _ := newPoolForTest(t, now)
	p.Add(idleEntry("c1", "nuclei", now))
	p.Add(idleEntry("c2", "nuclei", now))
	p.Add(idleEntry("c3", "nessus", now))
	p.Acquire("exec-1", "nuclei")

	if got := p.busyCount("nuclei"); got != 1 {
		t.Fatalf("busyCount(nuclei) = %d, want 1", got)
	}
}
