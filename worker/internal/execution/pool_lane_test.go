package execution

import (
	"context"
	"testing"

	"oasm-worker/internal/runtime"
)

func TestPoolKeyForSeparatesAgentLane(t *testing.T) {
	img := " GHCR.io/oasm/nuclei:3 "
	if got := poolKeyFor(JobSpec{Image: img}); got != "ghcr.io/oasm/nuclei:3" {
		t.Fatalf("registry key: got %q", got)
	}
	if got := poolKeyFor(JobSpec{Image: img, Lane: AgentLane}); got != "ghcr.io/oasm/nuclei:3#agent" {
		t.Fatalf("agent key: got %q", got)
	}
}

// A registry job holding the only replica of an image must not block an agent
// job of the same image: the lanes have separate replica counts.
func TestAgentLaneHasItsOwnReplicaCount(t *testing.T) {
	rt := runtime.NewFakeRuntime()
	mgr := NewManager(rt, 0)
	mgr.SetPool(NewPoolManager(0, 1, 0))
	img := "ghcr.io/oasm-platform/connector-nmap:7.97"

	if _, err := mgr.Submit(context.Background(), JobSpec{Tool: "nmap", Image: img, JobID: "registry-1"}); err != nil {
		t.Fatalf("registry submit: %v", err)
	}
	if _, err := mgr.Submit(context.Background(), JobSpec{Tool: "nmap", Image: img, JobID: "agent-1", Lane: AgentLane}); err != nil {
		t.Fatalf("agent submit must not be blocked by the registry replica: %v", err)
	}
	if got := rt.CreateSpecs[len(rt.CreateSpecs)-1].PoolKey; got != img+"#agent" {
		t.Fatalf("agent container pool key: got %q", got)
	}
}
