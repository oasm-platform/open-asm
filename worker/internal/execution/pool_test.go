package execution

import (
	"context"
	"sync"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// countingRuntime wraps FakeRuntime and records cleanup calls so tests can
// assert that pooled containers are only retired when they should be.
type countingRuntime struct {
	*runtime.FakeRuntime
	mu       sync.Mutex
	cleanups []string
}

func (c *countingRuntime) Cleanup(ctx context.Context, h runtime.Handle) error {
	c.mu.Lock()
	c.cleanups = append(c.cleanups, h.ID)
	c.mu.Unlock()
	return c.FakeRuntime.Cleanup(ctx, h)
}

func (c *countingRuntime) cleanupCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.cleanups)
}

func (c *countingRuntime) cleaned(h string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, id := range c.cleanups {
		if id == h {
			return true
		}
	}
	return false
}

// newPooledManager builds a Manager with a guaranteed-running FakeRuntime and a
// counting wrapper, with the pool configured as given.
func newPooledManager(t *testing.T, cfg PoolConfig) (*Manager, *countingRuntime) {
	t.Helper()
	fake := runtime.NewFakeRuntime()
	fake.SetInspectFn(func() runtime.InspectResult { return runtime.InspectResult{Running: true} })
	rt := &countingRuntime{FakeRuntime: fake}
	return NewManager(rt, 0, WithPool(cfg)), rt
}

func poolSpec(image string) JobSpec {
	return JobSpec{Tool: "nuclei", Image: image}
}

// A pool of 5 jobs on the same image (poolKey=image) with
// MAX_JOBS_PER_CONTAINER=5 must create exactly one container: the first job
// creates it, the remaining four reuse it.
func TestPoolReusesContainerForSameImage(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 5, IdleTimeout: 2 * time.Minute})

	ids := make([]string, 5)
	for i := 0; i < 5; i++ {
		id, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
		if err != nil {
			t.Fatalf("submit %d: %v", i, err)
		}
		ids[i] = id
	}

	if got := rt.CreateCount; got != 1 {
		t.Fatalf("expected 1 container create for 5 same-image jobs, got %d", got)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.pool) != 1 || len(m.pool["nuclei:2.0"]) != 1 {
		t.Fatalf("expected exactly one pooled container for the image, pool=%+v", m.pool)
	}
	for _, ent := range m.pool["nuclei:2.0"] {
		if ent.jobsCount != 5 {
			t.Fatalf("expected pool entry to hold 5 jobs, got %d", ent.jobsCount)
		}
		for _, id := range ids {
			if !ent.jobs[id] {
				t.Fatalf("pool entry missing job %s", id)
			}
		}
	}
}

// 5 jobs with MAX_JOBS_PER_CONTAINER=2 need ceil(5/2)=3 containers; each
// container must never exceed 2 concurrent jobs.
func TestPoolSplitsByMaxJobsPerContainer(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 2, IdleTimeout: 2 * time.Minute})

	for i := 0; i < 5; i++ {
		if _, err := m.Submit(context.Background(), poolSpec("nuclei:2.0")); err != nil {
			t.Fatalf("submit %d: %v", i, err)
		}
	}

	if got := rt.CreateCount; got != 3 {
		t.Fatalf("expected ceil(5/2)=3 containers, got %d", got)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	ents := m.pool["nuclei:2.0"]
	if len(ents) != 3 {
		t.Fatalf("expected 3 pooled containers, got %d", len(ents))
	}
	total := 0
	for _, ent := range ents {
		if ent.jobsCount > 2 {
			t.Fatalf("entry %s exceeded max jobs: %d", ent.handle.ID, ent.jobsCount)
		}
		total += ent.jobsCount
	}
	if total != 5 {
		t.Fatalf("pool entries must hold all 5 jobs, hold %d", total)
	}
}

// Jobs with different images (different poolKeys) never share a container,
// even when both pools have capacity.
func TestPoolDoesNotShareAcrossImages(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 5, IdleTimeout: 2 * time.Minute})

	for i := 0; i < 3; i++ {
		if _, err := m.Submit(context.Background(), poolSpec("nuclei:2.0")); err != nil {
			t.Fatalf("submit nuclei %d: %v", i, err)
		}
		if _, err := m.Submit(context.Background(), poolSpec("httpx:1.0")); err != nil {
			t.Fatalf("submit httpx %d: %v", i, err)
		}
	}

	if got := rt.CreateCount; got != 2 {
		t.Fatalf("expected 2 containers (one per image), got %d", got)
	}
}

// Cancel in pool mode is bookkeeping only: the shared container must stay up
// for sibling jobs, so no rt.Cancel and no Cleanup may run.
func TestPoolCancelKeepsContainerForSiblings(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 5, IdleTimeout: 2 * time.Minute})

	id1, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}
	id2, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}

	if err := m.Cancel(context.Background(), id1); err != nil {
		t.Fatal(err)
	}

	if got := rt.CancelCallCount(); got != 0 {
		t.Fatalf("pool-mode Cancel must not propagate to runtime, got %d cancel calls", got)
	}
	if got := rt.cleanupCount(); got != 0 {
		t.Fatalf("pool-mode Cancel must not clean up the shared container, got %d cleanups", got)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	ents := m.pool["nuclei:2.0"]
	if len(ents) != 1 {
		t.Fatal("pool entry must survive Cancel")
	}
	if ents[0].jobsCount != 1 || !ents[0].jobs[id2] {
		t.Fatalf("expected entry to hold only %s, got jobsCount=%d", id2, ents[0].jobsCount)
	}
}

// A running container that finishes its last job stays pooled (idle); the next
// same-image job reuses it. No cleanup may happen between the two.
func TestPoolReleaseKeepsRunningContainerForSequentialReuse(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 2, IdleTimeout: 2 * time.Minute})

	id1, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Release(context.Background(), id1); err != nil {
		t.Fatal(err)
	}
	if got := rt.cleanupCount(); got != 0 {
		t.Fatalf("running empty container must stay pooled, got %d cleanups", got)
	}
	if got := m.ActiveCount(); got != 0 {
		t.Fatalf("expected no active executions after Release, got %d", got)
	}

	if _, err := m.Submit(context.Background(), poolSpec("nuclei:2.0")); err != nil {
		t.Fatal(err)
	}
	if got := rt.CreateCount; got != 1 {
		t.Fatalf("expected sequential reuse of the pooled container, creates=%d", got)
	}
}

// An exited container is retired on Release; the next submit falls back to
// creating a fresh container instead of crashing or reusing the dead one.
func TestPoolReleaseExitedContainerFallsBackToCreate(t *testing.T) {
	fake := runtime.NewFakeRuntime()
	fake.SetInspectFn(func() runtime.InspectResult {
		return runtime.InspectResult{Running: false, ExitCode: 1}
	})
	rt := &countingRuntime{FakeRuntime: fake}
	m := NewManager(rt, 0, WithPool(PoolConfig{Enabled: true, MaxJobsPerContainer: 2, IdleTimeout: 2 * time.Minute}))

	id1, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Release(context.Background(), id1); err != nil {
		t.Fatal(err)
	}

	m.mu.Lock()
	entries := len(m.pool)
	m.mu.Unlock()
	if entries != 0 {
		t.Fatalf("exited container must be removed from the pool, entries=%d", entries)
	}

	if _, err := m.Submit(context.Background(), poolSpec("nuclei:2.0")); err != nil {
		t.Fatal(err)
	}
	if got := rt.CreateCount; got != 2 {
		t.Fatalf("expected a fresh container after the old one exited, creates=%d", got)
	}
}

// Idle empty containers past POOL_IDLE_TIMEOUT are evicted (Cleanup + entry
// removal); the pool refills with a create on the next submit.
func TestPoolEvictsIdleContainer(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 2, IdleTimeout: 2 * time.Minute})

	id1, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Release(context.Background(), id1); err != nil {
		t.Fatal(err)
	}

	m.mu.Lock()
	ent := m.pool["nuclei:2.0"][0]
	ent.lastUsed = time.Now().Add(-time.Hour)
	m.mu.Unlock()

	m.evictIdle(context.Background())

	if got := rt.cleanupCount(); got != 1 {
		t.Fatalf("expected eviction to clean up the idle container, cleanups=%d", got)
	}
	m.mu.Lock()
	_, stillThere := m.pool["nuclei:2.0"]
	m.mu.Unlock()
	if stillThere {
		t.Fatal("evicted entry must be removed from the pool")
	}

	if _, err := m.Submit(context.Background(), poolSpec("nuclei:2.0")); err != nil {
		t.Fatal(err)
	}
	if got := rt.CreateCount; got != 2 {
		t.Fatalf("expected a new container after eviction, creates=%d", got)
	}
}

// A dead container with surviving siblings is marked draining: new submissions
// must not join it, and it must not be cleaned up underneath the surviving job.
func TestPoolDrainsDeadContainerWithSiblings(t *testing.T) {
	fake := runtime.NewFakeRuntime()
	live := true
	fake.SetInspectFn(func() runtime.InspectResult {
		if live {
			return runtime.InspectResult{Running: true}
		}
		return runtime.InspectResult{Running: false, ExitCode: 1}
	})
	rt := &countingRuntime{FakeRuntime: fake}
	m := NewManager(rt, 0, WithPool(PoolConfig{Enabled: true, MaxJobsPerContainer: 2, IdleTimeout: 2 * time.Minute}))

	id1, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}
	id2, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}

	live = false
	if err := m.Release(context.Background(), id1); err != nil {
		t.Fatal(err)
	}

	m.mu.Lock()
	ents := m.pool["nuclei:2.0"]
	if len(ents) == 0 {
		m.mu.Unlock()
		t.Fatal("entry must still exist while a sibling job is bound")
	}
	draining := false
	for _, e := range ents {
		if e.jobs[id2] {
			draining = e.state == poolStateDraining
		}
	}
	m.mu.Unlock()
	if !draining {
		t.Fatal("expected entry to be draining after its container died")
	}
	if got := rt.cleanupCount(); got != 0 {
		t.Fatalf("draining must not clean up underneath the surviving sibling, cleanups=%d", got)
	}

	id3, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
	if err != nil {
		t.Fatal(err)
	}
	m.mu.Lock()
	newEnt, _ := m.pool["nuclei:2.0"]
	joinedDraining := false
	for _, e := range newEnt {
		if e.jobs[id3] && e.state == poolStateDraining {
			joinedDraining = true
		}
	}
	m.mu.Unlock()
	if joinedDraining {
		t.Fatal("new submission must not join a draining entry")
	}
	_ = id2
}

// Concurrent submissions of the same image must not double-create: with
// MAX_JOBS_PER_CONTAINER=2, 10 jobs need exactly 5 containers. Run under -race.
func TestPoolConcurrentSubmitsDoNotDoubleCreate(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: true, MaxJobsPerContainer: 2, IdleTimeout: 2 * time.Minute})

	var wg sync.WaitGroup
	errs := make(chan error, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}

	if got := rt.CreateCount; got != 5 {
		t.Fatalf("expected ceil(10/2)=5 containers, got %d", got)
	}
}

// Pooling disabled (or config absent) keeps the legacy 1:1 contract: every
// job gets its own container and Cancel cleans it up immediately.
func TestPoolDisabledKeepsLegacyOneToOne(t *testing.T) {
	m, rt := newPooledManager(t, PoolConfig{Enabled: false, MaxJobsPerContainer: 5, IdleTimeout: 2 * time.Minute})

	ids := make([]string, 3)
	for i := 0; i < 3; i++ {
		id, err := m.Submit(context.Background(), poolSpec("nuclei:2.0"))
		if err != nil {
			t.Fatal(err)
		}
		ids[i] = id
	}
	if got := rt.CreateCount; got != 3 {
		t.Fatalf("legacy mode must create one container per job, got %d", got)
	}
	if err := m.Cancel(context.Background(), ids[0]); err != nil {
		t.Fatal(err)
	}
	if got := rt.CancelCallCount(); got != 1 {
		t.Fatalf("legacy Cancel must propagate to runtime, got %d", got)
	}
}
