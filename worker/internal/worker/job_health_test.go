package worker

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	pb "oasm-worker/internal/gen/jobs_registry"
	"oasm-worker/internal/runtime"
)

func resetWorkerGlobals() {
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()
}

// swapImageBackoff replaces the package-level backoff for the duration of the
// test and returns the previous instance for defer-restore.
func swapImageBackoff(b *execution.ImageBackoff) *execution.ImageBackoff {
	old := imageBackoff
	imageBackoff = b
	return old
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met within timeout")
}

// TestHandleConnectorResultEarlyExitFailsWithTailAndBackoff: a container that
// crashes (exit != 0) while the job is still draining must be treated as a
// startup failure: container cancelled on a detached context, error submitted
// to Core with the tail of container logs attached, and the image recorded as
// failed so subsequent jobs back off.
func TestHandleConnectorResultEarlyExitFailsWithTailAndBackoff(t *testing.T) {
	resetWorkerGlobals()
	oldInterval := healthPollInterval
	healthPollInterval = 10 * time.Millisecond
	defer func() { healthPollInterval = oldInterval }()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	rt := &ctxRecordingRuntime{FakeRuntime: fakeRT}
	mgr := execution.NewManager(rt, 0)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 256)

	image := "ghcr.io/open-asm/nuclei:1.0"
	backoff := execution.NewImageBackoff()
	oldBackoff := swapImageBackoff(backoff)
	defer func() { imageBackoff = oldBackoff }()

	// Runtime starts healthy, then the container crashes.
	var crashed atomic.Bool
	rt.SetInspectFn(func() runtime.InspectResult {
		if crashed.Load() {
			return runtime.InspectResult{Running: false, ExitCode: 1}
		}
		return runtime.InspectResult{Running: true, Health: "healthy"}
	})
	rt.SetLogLines([][]byte{[]byte("nuclei: scanning target\n"), []byte("nuclei: BOOM fatal error\n")})

	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei", Image: image})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-he-1", category: "subdomains", release: func() {}, image: image}
	bridgeMu.Unlock()
	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)
	tail := &tailBuffer{}

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, mgr, tail)
		close(done)
	}()

	// Let the health poll observe a healthy container several times, then crash it.
	waitFor(t, 3*time.Second, func() bool { return rt.InspectCallCount() >= 2 })
	crashed.Store(true)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for early-exit failure handling")
	}

	// Container must be gone from the Manager.
	if got := mgr.ActiveCount(); got != 0 {
		t.Fatalf("expected execution removed after early exit, ActiveCount=%d", got)
	}

	// Cancel/Cleanup must have run on a detached context (see job_cleanup_test.go).
	cancelCtxs, cleanupCtxs := rt.snapshot()
	assertDetachedContexts(t, "cancel", cancelCtxs)
	assertDetachedContexts(t, "cleanup", cleanupCtxs)

	// The image must now be backing off.
	if ok, _ := backoff.Allow(image); ok {
		t.Fatal("expected image backing off after early-exit failure")
	}

	// Core must receive an error carrying the container log tail.
	results := jobsSrv.getResults()
	if len(results) == 0 {
		t.Fatal("expected an error submission to Core")
	}
	last := results[len(results)-1]
	if !last.isError {
		t.Fatal("expected the terminal submission to be an error")
	}
	if !strings.Contains(last.raw, "nuclei: BOOM fatal error") {
		t.Fatalf("error payload must include container log tail, got %q", last.raw)
	}
}

// TestHandleConnectorResultTimeoutBacksOff tests the connect-timeout path also
// records a failure against the image (subsequent jobs must back off).
func TestHandleConnectorResultTimeoutBacksOff(t *testing.T) {
	resetWorkerGlobals()

	client, _, fakeRT := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	image := "ghcr.io/open-asm/nuclei:1.0"
	backoff := execution.NewImageBackoff()
	oldBackoff := swapImageBackoff(backoff)
	defer func() { imageBackoff = oldBackoff }()

	mgr := execution.NewManager(fakeRT, 0)
	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei", Image: image})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-tmo-1", category: "subdomains", release: func() {}, image: image}
	bridgeMu.Unlock()
	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)
	tail := &tailBuffer{}

	sessionCtx, sessionCancel := context.WithCancel(context.Background())
	sessionCancel() // reconnect cancelled the session

	done := make(chan struct{})
	go func() {
		handleConnectorResult(sessionCtx, execID, client, events, proxy, resultCh, time.Now(), 50*time.Millisecond, mgr, tail)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for connect-timeout handling")
	}

	if ok, _ := backoff.Allow(image); ok {
		t.Fatal("expected image backing off after connect timeout")
	}
}

// TestHandleConnectorResultDoneResetsBackoff tests a successful connector job
// (Done, no error) clears the image's failure history.
func TestHandleConnectorResultDoneResetsBackoff(t *testing.T) {
	resetWorkerGlobals()

	client, _, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	image := "ghcr.io/open-asm/nuclei:1.0"
	backoff := execution.NewImageBackoff()
	backoff.RecordFailure(image)
	backoff.RecordFailure(image)
	if ok, _ := backoff.Allow(image); ok {
		t.Fatal("precondition: expected image backing off before the success run")
	}
	oldBackoff := swapImageBackoff(backoff)
	defer func() { imageBackoff = oldBackoff }()

	execID := "exec-reset-1"
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-reset-1", category: "subdomains", release: func() {}, image: image}
	bridgeMu.Unlock()
	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	proxy.ForwardResult(execID, []byte(`{"host":"example.com"}`))
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	if ok, _ := backoff.Allow(image); !ok {
		t.Fatal("expected image backoff reset after a successful job")
	}
}

// TestHandleConnectorResultForwardsLogsToTail tests container logs are streamed
// into the tail buffer and surfaced on the worker log while the job runs.
func TestHandleConnectorResultForwardsLogsToTail(t *testing.T) {
	resetWorkerGlobals()
	oldInterval := healthPollInterval
	healthPollInterval = 10 * time.Millisecond
	defer func() { healthPollInterval = oldInterval }()

	client, _, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 256)

	fakeRT.SetLogLines([][]byte{[]byte("nuclei: scan started\n"), []byte("nuclei: probe 443 open\n")})
	// The container stays up while the drain runs; the health monitor must not
	// treat it as a startup failure.
	fakeRT.SetInspectFn(func() runtime.InspectResult { return runtime.InspectResult{Running: true} })

	// Logs is keyed on a Manager execution, so the exec must exist in Manager.
	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0"})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}
	bridgeMu.Lock()
	bridge[execID] = &bridgeEntry{jobID: "job-logs-1", category: "subdomains", release: func() {}, image: "ghcr.io/open-asm/nuclei:1.0"}
	bridgeMu.Unlock()
	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)
	tail := &tailBuffer{}

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, mgr, tail)
		close(done)
	}()

	// Log lines must reach the tail buffer while the drain is still running.
	waitFor(t, 3*time.Second, func() bool { return strings.Contains(tail.String(), "scan started") })

	proxy.ForwardResult(execID, []byte(`{"host":"example.com"}`))
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	if s := tail.String(); !strings.Contains(s, "probe 443 open") {
		t.Fatalf("expected both log lines in tail, got %q", s)
	}
}

// TestProcessConnectorJobFailFastSkipsContainer tests the backoff gate: when
// the image is backing off, a new job for the same image fails fast — no
// container is created, Core receives a clear "backing off, retry in Xs"
// error, and no async completion handler is spawned.
func TestProcessConnectorJobFailFastSkipsContainer(t *testing.T) {
	resetWorkerGlobals()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	image := "ghcr.io/open-asm/nuclei:1.0"
	backoff := execution.NewImageBackoff()
	backoff.RecordFailure(image)
	if ok, _ := backoff.Allow(image); ok {
		t.Fatal("precondition: expected image backing off")
	}
	oldBackoff := swapImageBackoff(backoff)
	defer func() { imageBackoff = oldBackoff }()

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{Id: "job-ff-1", Tool: "nuclei", Image: image}, nil
	}

	releaseCh := make(chan struct{}, 1)
	releaseSem := func() { releaseCh <- struct{}{} }

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, mgr, proxy, releaseSem)

	if !hadJob {
		t.Fatal("expected hadJob=true")
	}
	if usedAsync {
		t.Fatal("expected usedAsync=false: fail-fast must not spawn a completion handler")
	}

	// No container may be created while the image is backing off.
	if fakeRT.CreateCount != 0 {
		t.Fatalf("expected 0 Create calls during backoff, got %d", fakeRT.CreateCount)
	}

	// The fail-fast error must reach Core with the retry hint.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected exactly 1 submission, got %d", len(results))
	}
	if !results[0].isError {
		t.Fatal("expected the fail-fast submission to be an error")
	}
	if !strings.Contains(results[0].raw, "backing off") || !strings.Contains(results[0].raw, "retry in") {
		t.Fatalf("expected 'backing off, retry in Xs' message, got %q", results[0].raw)
	}

	// The completion event must surface the same message.
	close(events) // range below must terminate
	gotCompleted := false
	for ev := range events {
		if ev.Type == EventJobCompleted {
			gotCompleted = true
			if ev.Success {
				t.Fatal("expected Success=false for fail-fast completion")
			}
			if !strings.Contains(ev.ErrorMsg, "backing off") {
				t.Fatalf("expected 'backing off' in completion error, got %q", ev.ErrorMsg)
			}
		}
	}
	if !gotCompleted {
		t.Fatal("expected EventJobCompleted for fail-fast job")
	}
	if len(releaseCh) != 0 {
		t.Fatal("fail-fast path must not release the semaphore itself (caller does)")
	}
}

// TestTailBufferCapTests tests the ring buffer trims to maxLines and maxBytes.
func TestTailBufferCapTests(t *testing.T) {
	var tb tailBuffer
	for i := 0; i < tailMaxLines+10; i++ {
		tb.append("line")
	}
	if len(tb.lines) != tailMaxLines {
		t.Fatalf("expected tail capped at %d lines, got %d", tailMaxLines, len(tb.lines))
	}

	var big tailBuffer
	big.append(strings.Repeat("x", tailMaxBytes+1000))
	if got := len(big.String()); got != tailMaxBytes {
		t.Fatalf("expected single over-long line truncated to %d bytes, got %d", tailMaxBytes, got)
	}

	if tb.String() == "" {
		t.Fatal("expected non-empty tail after appends")
	}
}
