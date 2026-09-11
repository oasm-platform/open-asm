package execution

import (
	"errors"
	"strings"
	"sync"
	"time"
)

// ErrPoolExhausted is returned by Manager.Submit (Phase 3 replica policy)
// when the image's replica quota is reached — no idle container AND every
// pooled container of the image is busy. The caller backs off and retries;
// the job is never failed to Core on this error.
var ErrPoolExhausted = errors.New("pool exhausted: max replicas reached for image")

// ---------------------------------------------------------------------------
// Warm-pool container reuse (Phase 2).
//
// Ubiquitous language: a "pool entry" is one docker container that survives
// its execution. It flips between PoolStateIdle (stream registered, no
// execution in flight) and PoolStateBusy (max one execution at a time —
// MaxJobsPerContainer=1 is enforced by the state machine itself). The pool key
// is the normalized (lowercase) container image: a new job of the same image
// acquires the container instead of creating a fresh one.
// ---------------------------------------------------------------------------

// PoolState is the lifecycle state of a pooled container.
type PoolState string

const (
	// PoolStateIdle: container registered with the connector server, no
	// execution in flight — eligible for Acquire.
	PoolStateIdle PoolState = "idle"
	// PoolStateBusy: an execution is in flight on this container — not
	// acquirable (MaxJobsPerContainer=1).
	PoolStateBusy PoolState = "busy"
)

// poolEntry is one pooled container. Keyed by container ID in byID; idle
// entries are additionally indexed by PoolKey for Acquire.
type poolEntry struct {
	ID         string    // docker container ID (runtime Handle.ID)
	Image      string    // container image
	PoolKey    string    // normalized image (lowercase) — the acquire key
	Stream     string    // connector stream identity; set once the SDK registers
	State      PoolState // idle | busy
	LastUsedAt time.Time // last transition time; Sweep evicts idle entries past the idle timeout
	ExecID     string    // owner execution ("" when idle)
	CPU        string    // manifest cpu the container was created with (informational)
	Memory     string    // manifest memory the container was created with (informational)
}

// PoolManager tracks pooled containers and hands them out for reuse. It is
// pure in-memory state — the Manager drives the runtime (Stop/Cleanup) when
// Sweep/Evict decide a container must go.
type PoolManager struct {
	mu                  sync.Mutex
	idleTimeout         time.Duration
	maxReplicasPerImage int // Phase 3 replica policy: busy containers per image cap, enforced via AtCapacity
	maxJobsPerContainer int // concurrency cap per container (1 in Phase 2)
	byID                map[string]*poolEntry
	idleByKey           map[string][]string // poolKey -> ordered container IDs (oldest LastUsedAt first)
	// owner maps execID → container ID for IsIdle lookups: ReleaseToIdle
	// clears the entry's ExecID (its execution is over) but the container is
	// still the same one backing that execID while it sits idle.
	owner map[string]string
	// now is injectable for deterministic Sweep tests; defaults to time.Now.
	now func() time.Time
}

// NewPoolManager creates an empty pool.
func NewPoolManager(idleTimeout time.Duration, maxReplicasPerImage, maxJobsPerContainer int) *PoolManager {
	return &PoolManager{
		idleTimeout:         idleTimeout,
		maxReplicasPerImage: maxReplicasPerImage,
		maxJobsPerContainer: maxJobsPerContainer,
		byID:                map[string]*poolEntry{},
		idleByKey:           map[string][]string{},
		owner:               map[string]string{},
		now:                 time.Now,
	}
}

// normalizePoolKey canonicalizes the acquire key: lowercase image, trimmed.
func normalizePoolKey(image string) string {
	return strings.ToLower(strings.TrimSpace(image))
}

// Add records a freshly created container in the pool as idle.
func (p *PoolManager) Add(entry poolEntry) {
	p.mu.Lock()
	defer p.mu.Unlock()
	entry.PoolKey = normalizePoolKey(entry.PoolKey)
	if entry.State == "" {
		entry.State = PoolStateIdle
	}
	if entry.LastUsedAt.IsZero() {
		entry.LastUsedAt = p.now()
	}
	e := entry
	p.byID[e.ID] = &e
	if e.ExecID != "" {
		// Register the owner mapping for freshly CREATED containers too
		// (not just Acquire hits): ReleaseToIdle/Evict/IsIdle resolve the
		// container through owner[execID]. Without this a created container
		// stuck Busy could never be handed back or evicted.
		p.owner[e.ExecID] = e.ID
	}
	if e.State == PoolStateIdle {
		p.indexIdle(e.ID, e.PoolKey)
	}
}

// indexIdle appends an idle container to its pool-key queue (must hold mu).
func (p *PoolManager) indexIdle(cid, key string) {
	p.idleByKey[key] = append(p.idleByKey[key], cid)
}

// unindexIdle removes a container ID from its pool-key idle queue (must hold mu).
func (p *PoolManager) unindexIdle(cid, key string) {
	q := p.idleByKey[key]
	for i, id := range q {
		if id == cid {
			p.idleByKey[key] = append(q[:i], q[i+1:]...)
			if len(p.idleByKey[key]) == 0 {
				delete(p.idleByKey, key)
			}
			return
		}
	}
}

// Acquire assigns an idle container of the given image key to execID.
// Returns the container ID and true on a pool hit; false on a miss (the
// caller then creates a fresh container). MaxJobsPerContainer=1 is enforced
// structurally: busy entries are not in the idle queue.
func (p *PoolManager) Acquire(execID, image string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	key := normalizePoolKey(image)
	q := p.idleByKey[key]
	for len(q) > 0 {
		cid := q[0]
		e, ok := p.byID[cid]
		if !ok || e.State != PoolStateIdle {
			// entry vanished or busy — drop from queue, try next
			q = q[1:]
			p.idleByKey[key] = q
			continue
		}
		e.State = PoolStateBusy
		e.ExecID = execID
		e.LastUsedAt = p.now()
		// Re-acquire takes the container over from its previous execution.
		// ReleaseToIdle deliberately KEEPS the previous owner mapping (for
		// IsIdle) and clears the entry's ExecID, so the stale mapping is only
		// discoverable through the owner map itself: purge every entry pointing
		// at this container BEFORE re-owning it — otherwise the owner map grows
		// one dead entry per reuse and a late Evict(oldExecID) would remove a
		// container now running the NEW execution.
		p.purgeOwnerByContainer(cid)
		p.owner[execID] = cid
		p.unindexIdle(cid, key)
		return cid, true
	}
	return "", false
}

// ReleaseToIdle returns the container owned by execID to the idle queue.
// The owner mapping is KEPT: IsIdle(execID) must answer "the container is
// idle (no execution in flight)" during the drain's final health polls.
// Idempotent for unknown/missing entries (caller treats it best-effort).
func (p *PoolManager) ReleaseToIdle(execID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	cid, ok := p.owner[execID]
	if !ok {
		return
	}
	if e, ok := p.byID[cid]; ok && e.ExecID == execID {
		e.State = PoolStateIdle
		e.ExecID = ""
		e.LastUsedAt = p.now()
		p.indexIdle(e.ID, e.PoolKey)
	}
}

// Sweep returns every idle entry idle for at least the idle timeout. The
// caller (Manager.SweepLoop) stops, cleans up and unregisters them. Busy
// entries and fresh idle entries are never collected.
func (p *PoolManager) Sweep(now time.Time) []poolEntry {
	p.mu.Lock()
	defer p.mu.Unlock()
	var stale []poolEntry
	for cid, e := range p.byID {
		if e.State != PoolStateIdle {
			continue
		}
		if now.Sub(e.LastUsedAt) < p.idleTimeout {
			continue
		}
		stale = append(stale, *e)
		p.unindexIdle(cid, e.PoolKey)
		delete(p.byID, cid)
		// ReleaseToIdle keeps the last execution's owner mapping alive for
		// IsIdle; once the container is collected that mapping is dead weight
		// (the drained execution survives until process exit otherwise) — purge
		// every owner entry pointing at the removed container.
		p.purgeOwnerByContainer(cid)
	}
	return stale
}

// purgeOwnerByContainer removes every owner[execID] mapping pointing at cid
// (must hold p.mu). Deleting map entries during range is safe in Go.
func (p *PoolManager) purgeOwnerByContainer(cid string) {
	for execID, ownerCid := range p.owner {
		if ownerCid == cid {
			delete(p.owner, execID)
		}
	}
}

// Evict force-removes the container owned by execID regardless of state
// (connector stream died / sweep). Returns the container ID or "".
func (p *PoolManager) Evict(execID string) string {
	p.mu.Lock()
	defer p.mu.Unlock()
	cid, ok := p.owner[execID]
	if !ok {
		return ""
	}
	e, ok := p.byID[cid]
	if !ok {
		return ""
	}
	if e.State == PoolStateIdle {
		p.unindexIdle(cid, e.PoolKey)
	}
	delete(p.byID, cid)
	delete(p.owner, execID)
	// The container can also be mapped under a PREVIOUS execution's ID
	// (re-acquire / adopt-fail path): purge every owner entry pointing at it
	// so Evict never leaves a stale routing behind.
	p.purgeOwnerByContainer(cid)
	return cid
}

// IsIdle reports whether the container backing execID is idle (no execution in
// flight). The job goroutine uses it to skip health checks while a reused
// container sits between executions.
func (p *PoolManager) IsIdle(execID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	cid, ok := p.owner[execID]
	if !ok {
		return false
	}
	e, ok := p.byID[cid]
	return ok && e.State == PoolStateIdle
}

// AtCapacity reports whether the image's replica quota is reached: every
// pooled container of the pool key is busy and no more may be created.
// Manager.Submit consults it after an Acquire miss to refuse the job with
// ErrPoolExhausted instead of creating another replica.
func (p *PoolManager) AtCapacity(poolKey string) bool {
	return p.busyCount(poolKey) >= p.maxReplicasPerImage
}

// busyCount reports how many containers of a pool key are currently busy.
// The Phase 3 replica policy caps this per image (AtCapacity).
func (p *PoolManager) busyCount(poolKey string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	key := normalizePoolKey(poolKey)
	n := 0
	for _, e := range p.byID {
		if e.PoolKey == key && e.State == PoolStateBusy {
			n++
		}
	}
	return n
}
