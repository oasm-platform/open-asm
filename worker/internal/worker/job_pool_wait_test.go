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

// TestProcessConnectorJobPoolWaitIsSilent: when every replica of an image is
// busy, the job simply queues. The retry loop used to log a "Pool at replica
// cap ... waiting for an idle pooled container (retry in 2s)" activity line on
// EVERY 2s retry per waiting job, which buried the activity feed under lines
// that carry no information the jobs table does not already show. The wait must
// now be silent; only the terminal outcome is reported.
func TestProcessConnectorJobPoolWaitIsSilent(t *testing.T) {
	resetWorkerGlobals()
	// A previous test may have left the image in backoff, which would fail this
	// job before it ever reaches the pool gate.
	oldBackoff := swapImageBackoff(execution.NewImageBackoff())
	t.Cleanup(func() { imageBackoff = oldBackoff })

	client, _, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0)
	// One busy replica is the whole cap for this image.
	pool := execution.NewPoolManager(0, 1, 0)
	mgr.SetPool(pool)
	proxy := connector.NewProxy()

	jobsSrvJob := func() *pb.Job {
		return &pb.Job{
			Id:    "job-pool-wait",
			Tool:  "nmap",
			Image: "ghcr.io/oasm-platform/connector-nmap:7.97",
		}
	}

	// Occupy the single replica slot with a first execution.
	occupied, err := mgr.Submit(context.Background(), execution.JobSpec{
		Tool:  "nmap",
		Image: "ghcr.io/oasm-platform/connector-nmap:7.97",
		JobID: "job-occupier",
	})
	if err != nil {
		t.Fatalf("Submit (occupier): %v", err)
	}
	if occupied == "" {
		t.Fatal("occupier execution id is empty")
	}

	events := make(chan TuiEvent, 256)
	// Long enough to cross the 2s pool retry delay at least twice, so silence is
	// proven across retries rather than within the first one.
	ctx, cancel := context.WithTimeout(context.Background(), 4500*time.Millisecond)
	defer cancel()

	releaseCh := make(chan struct{}, 1)
	done := make(chan struct{})
	start := time.Now()
	go func() {
		processConnectorJob(ctx, jobsSrvJob(), client, events, mgr, proxy, func() { releaseCh <- struct{}{} }, time.Now(), "ports_scanner")
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(20 * time.Second):
		t.Fatal("processConnectorJob did not return after the context expired")
	}
	if waited := time.Since(start); waited < 4*time.Second {
		t.Fatalf("job returned after %s — it never actually waited for a pool slot", waited)
	}

	close(events)
	var terminal int
	for e := range events {
		if e.Type != EventActivity {
			continue
		}
		// The regression: one such line per retry, per waiting job.
		if strings.Contains(e.Message, "Pool at replica cap") {
			t.Fatalf("pool-wait retry must not be logged, got %q", e.Message)
		}
		if strings.Contains(e.Message, "timed out waiting for a pooled container") {
			terminal++
			continue
		}
		if strings.Contains(e.Message, "Failed to submit connector job") {
			// The terminal outcome is also reported by the generic submit
			// failure path; it is one line, not one per retry.
			terminal++
		}
	}

	if terminal == 0 {
		t.Fatal("expected the terminal pool-wait failure to be reported")
	}
	if terminal > 2 {
		t.Fatalf("expected at most 2 terminal lines, got %d", terminal)
	}
}
