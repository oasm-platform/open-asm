package execution

import (
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

func TestContainerSnapshotsDeduplicateActivePoolEntries(t *testing.T) {
	now := time.Now().UTC()
	manager := NewManager(runtime.NewFakeRuntime(), 10)
	pool := NewPoolManager(time.Minute, 2, 1)
	manager.SetPool(pool)

	active := &Execution{
		ID:     "exec-1",
		State:  StateRunning,
		Handle: runtime.Handle{ID: "container-active", Name: "active", CreatedAt: now},
		Spec: JobSpec{
			Tool:    "nmap",
			Image:   "example/nmap:latest",
			Version: "1.0.0",
			JobID:   "job-1",
			TraceID: "trace-1",
			Limits:  map[string]any{"cpu": "1", "memory": "1Gi"},
		},
		CreatedAt:      now,
		StartedAt:      now,
		StateChangedAt: now,
	}
	manager.execs[active.ID] = active
	pool.Add(poolEntry{
		ID:             active.Handle.ID,
		Name:           active.Handle.Name,
		Image:          active.Spec.Image,
		ImageVersion:   active.Spec.Version,
		Tool:           active.Spec.Tool,
		State:          PoolStateBusy,
		ExecID:         active.ID,
		LastJobID:      active.Spec.JobID,
		CreatedAt:      now,
		StateChangedAt: now,
		LastUsedAt:     now,
	})
	pool.Add(poolEntry{
		ID:             "container-idle",
		Name:           "idle",
		Image:          "example/naabu:latest",
		ImageVersion:   "2.0.0",
		Tool:           "naabu",
		State:          PoolStateIdle,
		LastJobID:      "job-old",
		CreatedAt:      now,
		StateChangedAt: now,
		LastUsedAt:     now,
	})

	snapshots := manager.ContainerSnapshots()
	if len(snapshots) != 2 {
		t.Fatalf("expected active and idle containers, got %d: %#v", len(snapshots), snapshots)
	}
	byID := make(map[string]ContainerDescriptor, len(snapshots))
	for _, snapshot := range snapshots {
		byID[snapshot.Handle.ID] = snapshot
	}
	if got := byID["container-active"]; got.JobID != "job-1" || got.Tool != "nmap" || !got.Pooled {
		t.Fatalf("active descriptor lost execution metadata: %#v", got)
	}
	if got := byID["container-idle"]; got.PoolState != PoolStateIdle || got.ExecutionID != "" || got.Tool != "naabu" {
		t.Fatalf("idle descriptor is incorrect: %#v", got)
	}
}
