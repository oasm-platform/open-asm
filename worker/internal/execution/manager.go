package execution

import (
	"context"
	"fmt"
	"sync"
	"time"

	"oasm-worker/internal/runtime"
)

// Logger receives error notifications from Manager when background
// container-engine operations fail. TuiLogger (worker package) satisfies it.
// A nil logger disables reporting.
type Logger interface {
	Error(msg string, args ...any)
	ErrorE(msg string, err error)
}

// InfoLogger is the optional extension for pool hit/miss reporting. Only
// loggers that implement it (e.g. TuiLogger) receive lifecycle lines; the
// minimal recorderLogger in tests implements Logger alone and stays valid.
type InfoLogger interface {
	Info(msg string, args ...any)
}

// PoolConfig controls the per-tool container pool: a live container is reused
// for up to MaxJobsPerContainer concurrent jobs sharing the same image
// (poolKey). IdleTimeout bounds how long an empty pooled container is retained
// before eviction.
type PoolConfig struct {
	Enabled             bool
	MaxJobsPerContainer int
	IdleTimeout         time.Duration
}

// WithPool enables container pooling. Omit for the legacy 1:1 behavior (one
// container per job, cleaned up on Cancel/connector-down).
func WithPool(cfg PoolConfig) Option {
	return func(m *Manager) {
		m.poolCfg = cfg
	}
}

// Option configures a Manager. Applied in NewManager.
type Option func(*Manager)

// poolState tracks a pooled container's lifecycle.
type poolState string

const (
	poolStateActive   poolState = "active"   // accepts new job registrations
	poolStateDraining poolState = "draining" // container dead/doomed; new jobs must not join
)

// PoolEntry is one pooled container behind a poolKey (image). Executions
// referencing the same Handle share it via their exec IDs in jobs.
type PoolEntry struct {
	handle    Handle
	jobs      map[string]bool
	jobsCount int
	lastUsed  time.Time
	state     poolState
}

// Manager tracks concurrent executions with a state machine.
// It replaces the legacy exec.Command sh -c path with isolated executions.
type Manager struct {
	mu             sync.Mutex
	rt             runtime.ExecutionRuntime
	maxConcurrency int
	execs          map[string]*Execution
	nextID         int
	logger         Logger

	poolCfg   PoolConfig
	pool      map[string][]*PoolEntry // poolKey(image) -> entries; one entry per container
	poolLocks sync.Map                // poolKey -> *sync.Mutex, serializes container creation per image
}

// NewManager creates a Manager backed by rt with at most maxConcurrency concurrent executions.
func NewManager(rt runtime.ExecutionRuntime, maxConcurrency int, opts ...Option) *Manager {
	m := &Manager{
		rt:             rt,
		maxConcurrency: maxConcurrency,
		execs:          map[string]*Execution{},
		pool:           map[string][]*PoolEntry{},
	}
	for _, opt := range opts {
		opt(m)
	}
	return m
}

// SetLogger wires an error logger for background container-engine operations.
// Nil disables logging (safe). Call once at startup, before Submit.
func (m *Manager) SetLogger(l Logger) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logger = l
}

// logError reports a container-engine operation failure via the injected
// Logger. No-op when no logger is set. Never panics.
func (m *Manager) logError(op string, err error) {
	m.mu.Lock()
	l := m.logger
	m.mu.Unlock()
	if l == nil {
		return
	}
	l.ErrorE(op, err)
}

// poolInfo reports a pool lifecycle event via the injected InfoLogger. No-op
// when the logger does not implement Info. Never panics. The logger reference
// is read lock-free (write-once at startup, same pattern as DockerRuntime) so
// this can be called while m.mu is held.
func (m *Manager) poolInfo(msg string, args ...any) {
	if il, ok := m.logger.(InfoLogger); ok {
		il.Info(msg, args...)
	}
}

// pooling reports whether the container pool is active. IdleTimeout > 0 makes
// eviction meaningful; MaxJobsPerContainer > 1 makes sharing worthwhile.
func (m *Manager) pooling() bool {
	return m.poolCfg.Enabled && m.poolCfg.MaxJobsPerContainer > 1 && m.poolCfg.IdleTimeout > 0
}

// poolLock returns (creating if needed) the per-image create mutex.
func (m *Manager) poolLock(key string) *sync.Mutex {
	if l, ok := m.poolLocks.Load(key); ok {
		return l.(*sync.Mutex)
	}
	l := &sync.Mutex{}
	actual, _ := m.poolLocks.LoadOrStore(key, l)
	return actual.(*sync.Mutex)
}

// poolEntry finds the pooled container whose handle matches h. The caller must
// hold m.mu.
func (m *Manager) poolEntry(h Handle) (string, *PoolEntry, bool) {
	for key, ents := range m.pool {
		for _, ent := range ents {
			if ent.handle.ID == h.ID {
				return key, ent, true
			}
		}
	}
	return "", nil, false
}

// removePoolEntry deletes ent from its key's entry list (and the key itself
// when it held the only entry). The caller must hold m.mu.
func (m *Manager) removePoolEntry(key string, ent *PoolEntry) {
	ents := m.pool[key]
	for i, e := range ents {
		if e == ent {
			rest := append(ents[:i], ents[i+1:]...)
			if len(rest) == 0 {
				delete(m.pool, key)
			} else {
				m.pool[key] = rest
			}
			return
		}
	}
}

// poolContains reports whether ent is still registered under key. The caller
// must hold m.mu.
func (m *Manager) poolContains(key string, ent *PoolEntry) bool {
	for _, e := range m.pool[key] {
		if e == ent {
			return true
		}
	}
	return false
}

// Submit enforces maxConcurrency, calls rt.Create+Start, and tracks the execution.
// Image is required and passed through to the runtime (resolved by Core ConnectorRegistry 1.5).
// If spec.Limits[timeoutSeconds] is set (>0), a timer auto-cancels the execution.
// With pooling enabled and spec.Image non-empty, jobs sharing an image reuse a
// live pooled container (poolKey=image) up to MaxJobsPerContainer; only a pool
// miss creates a container. Container creation per image is serialized so
// concurrent submits never double-create: total containers = ceil(jobs / max).
func (m *Manager) Submit(ctx context.Context, spec JobSpec) (string, error) {
	m.mu.Lock()
	// maxConcurrency <= 0 means unlimited — worker semaphore is the sole concurrency gate.
	if m.maxConcurrency > 0 && len(m.execs) >= m.maxConcurrency {
		m.mu.Unlock()
		return "", fmt.Errorf("max concurrency reached")
	}
	// Monotonic counter (not len(execs)): Cancel deletes entries, so a size-derived
	// ID collides with and overwrites a still-running execution.
	m.nextID++
	id := fmt.Sprintf("exec-%d", m.nextID)

	if !m.pooling() || spec.Image == "" {
		// Legacy 1:1 path — one container per job, unchanged.
		h, err := m.rt.Create(ctx, runtime.JobSpec{
			Tool:    spec.Tool,
			Image:   spec.Image,
			Version: spec.Version,
			Inputs:  spec.Inputs,
			Limits:  spec.Limits,
			TraceID: spec.TraceID,
			Config:  spec.Config,
			JobID:   spec.JobID,
			// Single source of truth: the connector registers under this ID
			// (EXECUTION_ID env), matching the proxy's pending/stream key.
			ExecID: id,
		}, runtime.RuntimeOpts{TraceID: spec.TraceID})
		if err != nil {
			m.mu.Unlock()
			return "", err
		}
		if err := m.rt.Start(ctx, h); err != nil {
			m.mu.Unlock()
			return "", err
		}
		m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: h}
		m.mu.Unlock()
		m.armTimeout(id, spec)
		return id, nil
	}

	key := spec.Image

	// Fast path: any live pooled container of this image with spare capacity
	// accepts the job.
	if ents := m.pool[key]; len(ents) > 0 {
		m.mu.Unlock()
		for _, ent := range ents {
			if res, ierr := m.rt.Inspect(ctx, ent.handle); ierr == nil && res.Running {
				if reused, _ := m.registerPooled(id, spec, key, ent); reused {
					return id, nil
				}
			}
		}
	} else {
		m.mu.Unlock()
	}

	// Miss path: create a fresh container. Serialized per poolKey with a
	// double-check — a sibling may have created a reusable container while we
	// waited on the key lock.
	keyLock := m.poolLock(key)
	keyLock.Lock()
	defer keyLock.Unlock()

	m.mu.Lock()
	ents := m.pool[key]
	var reusable *PoolEntry
	for _, ent := range ents {
		if ent.state == poolStateActive && ent.jobsCount < m.poolCfg.MaxJobsPerContainer {
			reusable = ent
			break
		}
	}
	m.mu.Unlock()
	if reusable != nil {
		if res, ierr := m.rt.Inspect(ctx, reusable.handle); ierr == nil && res.Running {
			if reused, _ := m.registerPooled(id, spec, key, reusable); reused {
				return id, nil
			}
		}
		m.mu.Lock()
		m.removePoolEntry(key, reusable)
		m.mu.Unlock()
	}

	h, err := m.rt.Create(ctx, runtime.JobSpec{
		Tool:    spec.Tool,
		Image:   spec.Image,
		Version: spec.Version,
		Inputs:  spec.Inputs,
		Limits:  spec.Limits,
		TraceID: spec.TraceID,
		Config:  spec.Config,
		JobID:   spec.JobID,
		ExecID:  id,
	}, runtime.RuntimeOpts{TraceID: spec.TraceID})
	if err != nil {
		return "", err
	}
	if err := m.rt.Start(ctx, h); err != nil {
		_ = m.rt.Cleanup(ctx, h) // never leak a half-started container
		return "", err
	}
	m.mu.Lock()
	ent := &PoolEntry{
		handle:    h,
		jobs:      map[string]bool{id: true},
		jobsCount: 1,
		lastUsed:  time.Now(),
		state:     poolStateActive,
	}
	m.pool[key] = append(m.pool[key], ent)
	m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: h}
	containers := len(m.pool[key])
	m.mu.Unlock()
	m.poolInfo("pool: miss, created container: image=%s exec=%s handle=%s containers=%d", key, id, h.ID, containers)
	m.armTimeout(id, spec)
	return id, nil
}

// registerPooled binds id to an existing pooled entry. Succeeds only when the
// entry is still part of the pool (identity check), active, and below
// capacity. Returns false when the job must instead go through the create path.
func (m *Manager) registerPooled(id string, spec JobSpec, key string, ent *PoolEntry) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, cur := range m.pool[key] {
		if cur == ent {
			if cur.state != poolStateActive || cur.jobsCount >= m.poolCfg.MaxJobsPerContainer {
				return false, nil
			}
			cur.jobs[id] = true
			cur.jobsCount++
			cur.lastUsed = time.Now()
			m.execs[id] = &Execution{ID: id, Spec: spec, State: StateRunning, Handle: cur.handle}
			m.poolInfo("pool: hit, reused container: image=%s exec=%s handle=%s jobs=%d", key, id, cur.handle.ID, cur.jobsCount)
			return true, nil
		}
	}
	return false, nil
}

// armTimeout auto-cancels the execution when spec.Limits carries
// timeoutSeconds > 0. The timer's only failure is "not found" (already
// removed); per the terminal-logging mandate it is still reported.
func (m *Manager) armTimeout(id string, spec JobSpec) {
	if secs := timeoutSeconds(spec.Limits); secs > 0 {
		execID := id
		time.AfterFunc(time.Duration(secs)*time.Second, func() {
			m.cancelTimeout(execID)
		})
	}
}

// cancelTimeout best-effort cancels an execution when its timer fires. The
// only failure is "not found" (already removed); per the terminal-logging
// mandate it is still reported, never silently dropped.
func (m *Manager) cancelTimeout(execID string) {
	if err := m.Cancel(context.Background(), execID); err != nil {
		m.logError("timeout cancel failed", err)
	}
}

// SubmitWithTimeout submits and auto-cancels after timeout (0 disables).
// Arms its own timer only when spec.Limits does NOT already carry timeoutSeconds,
// otherwise Submit's built-in timer would fire too — avoid double-arm duplicate cancels.
func (m *Manager) SubmitWithTimeout(ctx context.Context, spec JobSpec, timeout time.Duration) (string, error) {
	if timeout > 0 && timeoutSeconds(spec.Limits) <= 0 {
		id, err := m.Submit(ctx, spec)
		if err != nil {
			return "", err
		}
		execID := id
		time.AfterFunc(timeout, func() {
			m.cancelTimeout(execID)
		})
		return id, nil
	}
	return m.Submit(ctx, spec)
}

// Cancel marks the execution cancelled and stops tracking it. Inside the pool
// this is bookkeeping only: the borrowed container is a shared resource, so it
// is neither stopped nor removed — an exited/doomed container is retired by
// Release (drain) or eviction instead, and siblings are never disturbed. With
// pooling disabled the legacy contract applies: rt.Cancel + rt.Cleanup run
// immediately.
func (m *Manager) Cancel(ctx context.Context, id string) error {
	m.mu.Lock()
	e, ok := m.execs[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("not found")
	}
	h := e.Handle
	e.State = StateCancelled
	delete(m.execs, id)
	if m.pooling() {
		if _, ent, found := m.poolEntry(h); found {
			if ent.jobs[id] {
				delete(ent.jobs, id)
				ent.jobsCount--
				ent.lastUsed = time.Now()
			}
		}
		m.mu.Unlock()
		return nil
	}
	m.mu.Unlock()
	if err := m.rt.Cancel(ctx, h); err != nil {
		m.logError("container cancel failed", err)
	}
	if err := m.rt.Cleanup(ctx, h); err != nil {
		m.logError("container cleanup failed", err)
	}
	return nil
}

// Release retires an execution's claim on its pooled container (or a 1:1
// container in legacy mode). In pool mode an empty, still-running container
// stays pooled for the next same-image job; an exited/errored one is cleaned
// up and removed so the next submit falls back to a fresh create. Siblings
// left on a dead container are drained: the entry stops accepting new jobs and
// each sibling fails fast via its own health monitor.
func (m *Manager) Release(ctx context.Context, execID string) error {
	m.mu.Lock()
	e, ok := m.execs[execID]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	h := e.Handle
	e.State = StateDone
	delete(m.execs, execID)
	if !m.pooling() {
		m.mu.Unlock()
		if err := m.rt.Cleanup(ctx, h); err != nil {
			m.logError("container cleanup failed", err)
		}
		return nil
	}

	key, ent, found := m.poolEntry(h)
	if !found {
		m.mu.Unlock()
		// Entry already retired (evicted/replaced): retire the container too so
		// a half-registered execution cannot leak it.
		if err := m.rt.Cleanup(ctx, h); err != nil {
			m.logError("container cleanup failed", err)
		}
		return nil
	}
	if ent.jobs[execID] {
		delete(ent.jobs, execID)
		ent.jobsCount--
	}
	ent.lastUsed = time.Now()
	remain := ent.jobsCount
	m.mu.Unlock()

	if remain > 0 {
		// Siblings still bound. If the container died they each fail via their
		// health monitor; mark the entry draining so no new job joins a doomed
		// container. Live container: nothing to do, siblings keep using it.
		res, ierr := m.rt.Inspect(ctx, h)
		m.mu.Lock()
		if m.poolContains(key, ent) && (ierr != nil || !res.Running) {
			ent.state = poolStateDraining
			m.poolInfo("pool: container down, draining: image=%s handle=%s remaining=%d", key, h.ID, remain)
		}
		m.mu.Unlock()
		return nil
	}

	// Entry is empty: keep a live container for the next same-image job.
	res, ierr := m.rt.Inspect(ctx, h)
	if ierr != nil || !res.Running {
		_ = m.rt.Cleanup(ctx, h) // best-effort; retried by sweep if it fails
		m.mu.Lock()
		if m.poolContains(key, ent) && ent.jobsCount == 0 {
			m.removePoolEntry(key, ent)
		}
		m.mu.Unlock()
		m.poolInfo("pool: retired exited container: image=%s exec=%s handle=%s", key, execID, h.ID)
	} else {
		m.poolInfo("pool: kept idle container: image=%s handle=%s", key, h.ID)
	}
	return nil
}

// OnConnectorDown is the legacy name for Release; a connector's disconnect
// releases this execution's claim on its container.
func (m *Manager) OnConnectorDown(ctx context.Context, execID string) error {
	return m.Release(ctx, execID)
}

// evictIdle removes empty pooled containers idle past PoolConfig.IdleTimeout.
// A live-but-idle scannable container is kept; dead or unresponsive ones are
// force-removed. Exported via tests calling it directly; the maintenance
// goroutine (StartPoolMaintenance) drives it in production.
func (m *Manager) evictIdle(ctx context.Context) {
	m.mu.Lock()
	type candidate struct {
		key string
		ent *PoolEntry
	}
	var candidates []candidate
	now := time.Now()
	for k, ents := range m.pool {
		for _, ent := range ents {
			if ent.jobsCount == 0 && ent.state == poolStateActive && now.Sub(ent.lastUsed) >= m.poolCfg.IdleTimeout {
				candidates = append(candidates, candidate{k, ent})
			}
		}
	}
	m.mu.Unlock()

	for _, c := range candidates {
		// Probe liveness first: an Inspect error means the container already
		// vanished (best-effort engine state) — removal is still attempted.
		_, _ = m.rt.Inspect(ctx, c.ent.handle)
		if err := m.rt.Cleanup(ctx, c.ent.handle); err != nil {
			m.logError("pool eviction cleanup failed", err)
			continue
		}
		m.mu.Lock()
		if m.poolContains(c.key, c.ent) && c.ent.jobsCount == 0 {
			m.removePoolEntry(c.key, c.ent)
		}
		m.mu.Unlock()
		m.poolInfo("pool: evicted idle container: image=%s handle=%s", c.key, c.ent.handle.ID)
	}
}

// StartPoolMaintenance runs eviction of idle empty containers on a background
// ticker until ctx is cancelled. No-op when pooling is disabled.
// IdleTimeout/2 (min 10s) keeps an empty container alive at most ~1.5x the
// configured timeout.
func (m *Manager) StartPoolMaintenance(ctx context.Context) {
	if !m.pooling() {
		return
	}
	interval := m.poolCfg.IdleTimeout / 2
	if interval < 10*time.Second {
		interval = 10 * time.Second
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				m.evictIdle(ctx)
			}
		}
	}()
}

// SweepOrphans removes oasm-managed containers that no tracked pool entry
// references (crashed worker leftovers). Returns the count removed.
func (m *Manager) SweepOrphans(ctx context.Context) error {
	m.mu.Lock()
	keep := make([]string, 0, len(m.pool))
	for _, ents := range m.pool {
		for _, ent := range ents {
			keep = append(keep, ent.handle.ID)
		}
	}
	m.mu.Unlock()
	removed, err := m.rt.SweepOrphans(ctx, keep)
	if err == nil && removed > 0 {
		m.poolInfo("pool: swept %d orphan containers", removed)
	}
	return err
}

// ActiveCount returns the number of active executions.
func (m *Manager) ActiveCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.execs)
}

// Inspect returns the runtime inspect result for an execution by ID
// (health monitor). Errors when the execution is unknown or the runtime
// inspect fails.
func (m *Manager) Inspect(ctx context.Context, id string) (runtime.InspectResult, error) {
	m.mu.Lock()
	e, ok := m.execs[id]
	m.mu.Unlock()
	if !ok {
		return runtime.InspectResult{}, fmt.Errorf("execution %s not found", id)
	}
	return m.rt.Inspect(ctx, e.Handle)
}

// Logs opens the runtime log stream for an execution by ID (log tailer).
func (m *Manager) Logs(ctx context.Context, id string) (<-chan []byte, error) {
	m.mu.Lock()
	e, ok := m.execs[id]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("execution %s not found", id)
	}
	return m.rt.Logs(ctx, e.Handle)
}

func timeoutSeconds(limits map[string]any) int {
	if limits == nil {
		return 0
	}
	switch v := limits["timeoutSeconds"].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	}
	return 0
}
