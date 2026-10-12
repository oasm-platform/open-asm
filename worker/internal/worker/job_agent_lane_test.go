package worker

import (
	"context"
	"strings"
	"testing"
	"time"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	pb "oasm-worker/internal/gen/jobs_registry"
)

// An agent job that finds no free capacity must be refused at once — the
// agent is waiting on the call — instead of queueing for the 10-minute pool
// wait registry jobs use.
func TestAgentConnectorJobFailsFastWhenPoolExhausted(t *testing.T) {
	resetWorkerGlobals()
	oldBackoff := swapImageBackoff(execution.NewImageBackoff())
	t.Cleanup(func() { imageBackoff = oldBackoff })

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0)
	mgr.SetPool(execution.NewPoolManager(0, 1, 0))
	proxy := connector.NewProxy()
	img := "ghcr.io/oasm-platform/connector-nmap:7.97"

	// Occupy the only agent-lane replica.
	if _, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nmap", Image: img, JobID: "agent-occupier", Lane: execution.AgentLane}); err != nil {
		t.Fatalf("occupier: %v", err)
	}

	events := make(chan TuiEvent, 256)
	start := time.Now()
	processConnectorJob(context.Background(), &pb.Job{Id: "agent-job-1", Tool: "nmap", Image: img, Agent: true},
		client, events, mgr, proxy, func() {}, time.Now(), "ports_scanner")

	if waited := time.Since(start); waited > 2*time.Second {
		t.Fatalf("agent job waited %s for a pool slot; it must fail fast", waited)
	}
	results := jobsSrv.getResults()
	if len(results) != 1 || !results[0].isError || results[0].jobID != "agent-job-1" {
		t.Fatalf("expected one error result for agent-job-1, got %+v", results)
	}
	if !strings.Contains(results[0].raw, "worker out of capacity (cpu/mem)") {
		t.Fatalf("unexpected error text %q", results[0].raw)
	}
}
