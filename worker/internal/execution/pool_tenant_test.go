package execution

import (
	"context"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// submitAndRelease runs one job to completion so its container goes idle.
func submitAndRelease(t *testing.T, mgr *Manager, spec JobSpec) {
	t.Helper()
	id, err := mgr.Submit(context.Background(), spec)
	if err != nil {
		t.Fatalf("submit %s: %v", spec.JobID, err)
	}
	if err := mgr.Release(context.Background(), id); err != nil {
		t.Fatalf("release %s: %v", spec.JobID, err)
	}
}

// A warm container keeps the env, /tmp and process state of the job it ran,
// so it is reused only for a job of the same workspace.
func TestWarmContainerIsReusedOnlyWithinItsWorkspace(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	mgr := NewManager(rt, 0)
	mgr.SetPool(NewPoolManager(time.Hour, 0, 0))
	img := "ghcr.io/oasm-platform/connector-nuclei:3"

	submitAndRelease(t, mgr, JobSpec{Tool: "nuclei", Image: img, JobID: "a", WorkspaceID: "ws-1"})
	submitAndRelease(t, mgr, JobSpec{Tool: "nuclei", Image: img, JobID: "b", WorkspaceID: "ws-2"})
	if got := len(rt.CreateSpecs); got != 2 {
		t.Fatalf("a job of another workspace must get its own container: %d created, want 2", got)
	}

	submitAndRelease(t, mgr, JobSpec{Tool: "nuclei", Image: img, JobID: "c", WorkspaceID: "ws-1"})
	if got := len(rt.CreateSpecs); got != 2 {
		t.Fatalf("a job of the same workspace must reuse the idle container: %d created, want 2", got)
	}
}

// Without a workspace (older core-api) a registry job carrying config never
// reuses a container: it may hold another workspace's credentials.
func TestRegistryJobWithConfigButNoWorkspaceNeverReuses(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	mgr := NewManager(rt, 0)
	mgr.SetPool(NewPoolManager(time.Hour, 0, 0))
	img := "ghcr.io/oasm-platform/connector-nuclei:3"
	config := map[string]any{"apiKey": "k"}

	submitAndRelease(t, mgr, JobSpec{Tool: "nuclei", Image: img, JobID: "a", Config: config})
	submitAndRelease(t, mgr, JobSpec{Tool: "nuclei", Image: img, JobID: "b", Config: config})

	if got := len(rt.CreateSpecs); got != 2 {
		t.Fatalf("containers created = %d, want 2 (no reuse without a workspace)", got)
	}
}
