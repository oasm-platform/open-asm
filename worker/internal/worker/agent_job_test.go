package worker

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	pb "oasm-worker/internal/gen/jobs_registry"
	"oasm-worker/internal/runtime"
)

func TestRunAgentJobWithoutRuntimeReportsError(t *testing.T) {
	resetWorkerGlobals()
	client, jobsSrv, _ := newWorkerTestSetup(t)
	var wg sync.WaitGroup

	runAgentJob(context.Background(), &pb.Job{Id: "agent-norun", Category: "vulnerabilities", Image: "x"},
		client, make(chan TuiEvent, 16), nil, nil, &wg)
	wg.Wait()

	results := jobsSrv.getResults()
	if len(results) != 1 || !results[0].isError || results[0].jobID != "agent-norun" {
		t.Fatalf("expected one error result, got %+v", results)
	}
	if !strings.Contains(results[0].raw, "agent lane") {
		t.Fatalf("unexpected error text %q", results[0].raw)
	}
}

// The agent lane takes no MaxConcurrency slot (runAgentJob has no semaphore
// to take) and its container lands in the #agent pool.
func TestRunAgentJobStartsContainerOnAgentLane(t *testing.T) {
	resetWorkerGlobals()
	oldBackoff := swapImageBackoff(execution.NewImageBackoff())
	t.Cleanup(func() { imageBackoff = oldBackoff })

	client, _, fakeRT := newWorkerTestSetup(t)
	// The container stays up and is never cancelled. A stopped container lets
	// the completion handler finish and write imageBackoff after this test
	// returns, racing the next test's reset; uncancelled, it parks until the
	// 5-minute connect timeout.
	fakeRT.SetInspectFn(func() runtime.InspectResult { return runtime.InspectResult{Running: true} })
	mgr := execution.NewManager(fakeRT, 0)
	mgr.SetPool(execution.NewPoolManager(0, 1, 0))
	proxy := connector.NewProxy()
	var wg sync.WaitGroup

	img := "ghcr.io/oasm-platform/connector-nmap:7.97"
	// Agent flag deliberately unset: the lane comes from how the job arrived.
	runAgentJob(context.Background(), &pb.Job{Id: "agent-run-1", Tool: "nmap", Image: img, Category: "ports_scanner"},
		client, make(chan TuiEvent, 256), mgr, proxy, &wg)

	deadline := time.Now().Add(3 * time.Second)
	for fakeRT.CreateCallCount() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	wg.Wait()

	if fakeRT.CreateCount != 1 {
		t.Fatalf("expected one container, got %d", fakeRT.CreateCount)
	}
	if got := fakeRT.CreateSpecs[0].PoolKey; got != img+"#agent" {
		t.Fatalf("pool key: got %q", got)
	}
}
