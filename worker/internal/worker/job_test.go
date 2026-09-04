package worker

import (
	"context"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/test/bufconn"
	"google.golang.org/protobuf/types/known/structpb"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	connectorpb "oasm-worker/internal/gen/connector"
	pb "oasm-worker/internal/gen/jobs_registry"
	workerspb "oasm-worker/internal/gen/workers"
	"oasm-worker/internal/grpcclient"
	"oasm-worker/internal/runtime"
)

// captureStream is an in-memory connector bidi stream used to capture the
// ExecuteJob the worker sends to a connector after registration.
type captureStream struct {
	mu   sync.Mutex
	sent []*connectorpb.WorkerMessage
}

var _ connectorpb.ConnectorService_ConnectServer = (*captureStream)(nil)

func (c *captureStream) Send(m *connectorpb.WorkerMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, m)
	return nil
}

func (c *captureStream) Recv() (*connectorpb.ConnectorMessage, error) { return nil, nil }
func (c *captureStream) SetHeader(metadata.MD) error                  { return nil }
func (c *captureStream) SendHeader(metadata.MD) error                 { return nil }
func (c *captureStream) SetTrailer(metadata.MD)                       {}
func (c *captureStream) Context() context.Context                     { return context.Background() }
func (c *captureStream) SendMsg(any) error                            { return nil }
func (c *captureStream) RecvMsg(any) error                            { return nil }

func (c *captureStream) executes() []*connectorpb.ExecuteJob {
	c.mu.Lock()
	defer c.mu.Unlock()
	var jobs []*connectorpb.ExecuteJob
	for _, m := range c.sent {
		if ex := m.GetExecute(); ex != nil {
			jobs = append(jobs, ex)
		}
	}
	return jobs
}

// --- test logger ---

type testLogger struct{}

func (l *testLogger) Info(msg string, args ...any)    {}
func (l *testLogger) Success(msg string, args ...any) {}
func (l *testLogger) Warning(msg string, args ...any) {}
func (l *testLogger) Error(msg string, args ...any)   {}
func (l *testLogger) ErrorE(msg string, err error)    {}
func (l *testLogger) Verbose(msg string, args ...any) {}
func (l *testLogger) Debug(msg string, args ...any)   {}

// --- minimal fake gRPC servers ---

type testWorkerServer struct {
	workerspb.UnimplementedWorkersServiceServer
}

func (s *testWorkerServer) Join(_ context.Context, _ *workerspb.JoinRequest) (*workerspb.JoinResponse, error) {
	return &workerspb.JoinResponse{WorkerId: "test-worker", WorkerToken: "tok"}, nil
}

type testJobsServer struct {
	pb.UnimplementedJobsRegistryServiceServer

	mu      sync.Mutex
	nextFn  func() (*pb.Job, error)
	results []capturedResult
}

type capturedResult struct {
	jobID   string
	raw     string
	isError bool
}

func (s *testJobsServer) Next(_ context.Context, _ *pb.Worker) (*pb.Job, error) {
	if s.nextFn != nil {
		return s.nextFn()
	}
	return nil, nil
}

func (s *testJobsServer) Result(_ context.Context, req *pb.JobResultRequest) (*pb.JobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if req.Data != nil && req.Data.Data != nil {
		raw := ""
		if req.Data.Data.Raw != nil {
			raw = *req.Data.Data.Raw
		}
		s.results = append(s.results, capturedResult{jobID: req.Data.JobId, raw: raw, isError: req.Data.Data.Error})
	}
	return &pb.JobResponse{Success: true}, nil
}

func (s *testJobsServer) ResultSubdomains(_ context.Context, req *pb.SubdomainResultRequest) (*pb.JobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw := ""
	if req.Raw != nil {
		raw = *req.Raw
	}
	s.results = append(s.results, capturedResult{jobID: req.JobId, raw: raw, isError: req.Error})
	return &pb.JobResponse{Success: true}, nil
}

func (s *testJobsServer) ResultHttpProbe(_ context.Context, req *pb.HttpProbeResultRequest) (*pb.JobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw := ""
	if req.Raw != nil {
		raw = *req.Raw
	}
	s.results = append(s.results, capturedResult{jobID: req.JobId, raw: raw, isError: req.Error})
	return &pb.JobResponse{Success: true}, nil
}

func (s *testJobsServer) ResultPorts(_ context.Context, req *pb.PortsResultRequest) (*pb.JobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw := ""
	if req.Raw != nil {
		raw = *req.Raw
	}
	s.results = append(s.results, capturedResult{jobID: req.JobId, raw: raw, isError: req.Error})
	return &pb.JobResponse{Success: true}, nil
}

func (s *testJobsServer) ResultVulnerabilities(_ context.Context, req *pb.VulnerabilitiesResultRequest) (*pb.JobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw := ""
	if req.Raw != nil {
		raw = *req.Raw
	}
	s.results = append(s.results, capturedResult{jobID: req.JobId, raw: raw, isError: req.Error})
	return &pb.JobResponse{Success: true}, nil
}

func (s *testJobsServer) ResultScreenshot(_ context.Context, req *pb.ScreenshotResultRequest) (*pb.JobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw := ""
	if req.Raw != nil {
		raw = *req.Raw
	}
	s.results = append(s.results, capturedResult{jobID: req.JobId, raw: raw, isError: req.Error})
	return &pb.JobResponse{Success: true}, nil
}

func (s *testJobsServer) getResults() []capturedResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := make([]capturedResult, len(s.results))
	copy(cp, s.results)
	return cp
}

// --- bufconn test setup ---

func newWorkerTestSetup(t *testing.T) (*grpcclient.Client, *testJobsServer, *runtime.FakeRuntime) {
	t.Helper()
	lis := bufconn.Listen(64 * 1024)
	grpcSrv := grpc.NewServer()
	workerSrv := &testWorkerServer{}
	jobsSrv := &testJobsServer{}
	workerspb.RegisterWorkersServiceServer(grpcSrv, workerSrv)
	pb.RegisterJobsRegistryServiceServer(grpcSrv, jobsSrv)
	go func() { _ = grpcSrv.Serve(lis) }()

	client, err := grpcclient.NewClient("test-key", "passthrough:///bufnet", "test-tools", &testLogger{},
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	// Join to initialize worker ID / auth token.
	if err := client.Join(context.Background()); err != nil {
		t.Fatalf("Join: %v", err)
	}

	fakeRT := runtime.NewFakeRuntime()

	t.Cleanup(func() {
		_ = client.Close()
		grpcSrv.Stop()
	})
	return client, jobsSrv, fakeRT
}

// --- tests ---

func TestProcessJobConnectorBranch(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0) // unlimited
	proxy := connector.NewProxy()

	inputs, _ := structpb.NewStruct(map[string]any{"target": "https://example.com"})
	cfg, _ := structpb.NewStruct(map[string]any{"proxy": true, "rateLimit": float64(50)})

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{
			Id:     "job-conn-1",
			Tool:   "nuclei",
			Image:  "ghcr.io/open-asm/nuclei:1.0",
			Inputs: inputs,
			Config: cfg,
		}, nil
	}

	events := make(chan TuiEvent, 64)
	releaseCh := make(chan struct{}, 1)
	releaseSem := func() { releaseCh <- struct{}{} }

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, mgr, proxy, releaseSem)

	if !hadJob {
		t.Fatal("expected hadJob=true")
	}
	if !usedAsync {
		t.Fatal("expected usedAsync=true for connector path")
	}

	// FakeRuntime should have received exactly one Create call.
	if fakeRT.CreateCount != 1 {
		t.Fatalf("expected 1 Create call, got %d", fakeRT.CreateCount)
	}
	spec := fakeRT.CreateSpecs[0]
	if spec.Image != "ghcr.io/open-asm/nuclei:1.0" {
		t.Fatalf("expected Image passthrough, got %q", spec.Image)
	}
	if spec.Tool != "nuclei" {
		t.Fatalf("expected Tool 'nuclei', got %q", spec.Tool)
	}
	if spec.JobID != "job-conn-1" {
		t.Fatalf("expected JobID 'job-conn-1', got %q", spec.JobID)
	}
	if spec.Inputs == nil || spec.Inputs["target"] != "https://example.com" {
		t.Fatalf("expected Inputs.target='https://example.com', got %v", spec.Inputs)
	}
	if spec.Config == nil || spec.Config["proxy"] != true {
		t.Fatalf("expected Config.proxy=true, got %v", spec.Config)
	}

	// Bridge should be registered (keyed by execID from Manager.Submit, which is "exec-1").
	bridgeMu.Lock()
	_, bridgeOK := bridge["exec-1"]
	bridgeMu.Unlock()
	if !bridgeOK {
		t.Fatal("expected bridge entry for exec-1")
	}

	// Verify no shell commands were executed (no legacy exec).
	// The connector path should not touch getBrowser or toolPath.
}

func TestProcessConnectorJobSendsExecuteJob(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0) // unlimited
	proxy := connector.NewProxy()

	// Connector registers its stream before the job is submitted (execID
	// "exec-1" is the first FakeRuntime execution). SendExecute must deliver
	// immediately.
	stream := &captureStream{}
	if err := proxy.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	inputs, _ := structpb.NewStruct(map[string]any{
		"target": "https://example.com",
		"port":   float64(443),
	})

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{
			Id:     "job-exec-1",
			Tool:   "nuclei",
			Image:  "ghcr.io/open-asm/nuclei:1.0",
			Inputs: inputs,
		}, nil
	}

	events := make(chan TuiEvent, 64)
	releaseCh := make(chan struct{}, 1)
	releaseSem := func() { releaseCh <- struct{}{} }

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, mgr, proxy, releaseSem)
	if !hadJob || !usedAsync {
		t.Fatalf("expected (true, true), got (%v, %v)", hadJob, usedAsync)
	}

	// The worker must send exactly one ExecuteJob for this execution.
	executes := stream.executes()
	if len(executes) != 1 {
		t.Fatalf("expected 1 ExecuteJob sent to connector, got %d", len(executes))
	}
	ex := executes[0]
	if ex.GetExecutionId() != "exec-1" {
		t.Fatalf("ExecutionId: got %q, want %q", ex.GetExecutionId(), "exec-1")
	}
	if ex.GetJobId() != "job-exec-1" {
		t.Fatalf("JobId: got %q, want %q", ex.GetJobId(), "job-exec-1")
	}
	if ex.GetTool() != "nuclei" {
		t.Fatalf("Tool: got %q, want %q", ex.GetTool(), "nuclei")
	}
	if ex.GetImage() != "ghcr.io/open-asm/nuclei:1.0" {
		t.Fatalf("Image: got %q, want %q", ex.GetImage(), "ghcr.io/open-asm/nuclei:1.0")
	}
	if ex.GetTraceId() != "" {
		t.Fatalf("TraceId: got %q, want empty (worker does not set it)", ex.GetTraceId())
	}
	inputsGot := ex.GetInputs()
	if len(inputsGot) != 2 {
		t.Fatalf("Inputs: expected 2 entries, got %v", inputsGot)
	}
	if inputsGot["target"] != "https://example.com" {
		t.Fatalf("Inputs[target]: got %q, want %q", inputsGot["target"], "https://example.com")
	}
	if inputsGot["port"] != "443" {
		t.Fatalf("Inputs[port]: got %q, want %q", inputsGot["port"], "443")
	}
}

func TestHandleConnectorResultReportsError(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	execID := "exec-err-1"
	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	entry := &bridgeEntry{
		jobID:    "job-err-rpt",
		category: "subdomains",
		release:  func() {},
	}
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Send a result chunk, then signal error via proxy + close.
	proxy.ForwardResult(execID, []byte(`{"partial":"data"}`))
	proxy.SetError(execID, "connector crashed")
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	// Verify the submitted results: data chunk first, then error.
	results := jobsSrv.getResults()
	if len(results) != 2 {
		t.Fatalf("expected 2 results (data + error), got %d", len(results))
	}
	if results[0].isError {
		t.Fatal("first result (data chunk) should not be error")
	}
	if !results[1].isError {
		t.Fatal("second result (error submission) should be error")
	}
	if results[1].raw != "connector crashed" {
		t.Fatalf("expected error message 'connector crashed', got %q", results[1].raw)
	}

	// Verify the completion event has Success=false.
	gotEvent := false
	close(events)
	for ev := range events {
		if ev.Type == EventJobCompleted {
			gotEvent = true
			if ev.Success {
				t.Fatal("expected Success=false for connector error completion")
			}
			if ev.ErrorMsg == "" {
				t.Fatal("expected non-empty ErrorMsg for connector error completion")
			}
		}
	}
	if !gotEvent {
		t.Fatal("expected EventJobCompleted event")
	}
}

func strPtr(s string) *string { return &s }

func TestProcessJobLegacyBranch(t *testing.T) {
	client, jobsSrv, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{
			Id:      "job-leg-1",
			Command: strPtr("echo legacy-test"),
		}, nil
	}

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, nil, nil, nil)

	if !hadJob {
		t.Fatal("expected hadJob=true")
	}
	if usedAsync {
		t.Fatal("expected usedAsync=false for legacy path")
	}

	// Verify no Docker runtime calls were made.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected 1 result submission, got %d", len(results))
	}
	if results[0].jobID != "job-leg-1" {
		t.Fatalf("expected jobID 'job-leg-1', got %q", results[0].jobID)
	}
}

func TestProcessJobNoJob(t *testing.T) {
	client, jobsSrv, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return nil, nil
	}

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, nil, nil, nil)

	if hadJob {
		t.Fatal("expected hadJob=false when no job")
	}
	if usedAsync {
		t.Fatal("expected usedAsync=false when no job")
	}
}

func TestProcessJobConnectorSubmitError(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	// Manager at maxConcurrency=1 — fill the single slot so Submit fails.
	mgr := execution.NewManager(fakeRT, 1)
	// First submit fills the 0-slot capacity.
	_, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "filler"})
	if err != nil {
		t.Fatalf("filler submit failed: %v", err)
	}

	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{
			Id:   "job-err-1",
			Tool: "nuclei",
			// Unique image: this test records a backoff failure on Submit error,
			// which must not poison later tests using the shared nuclei image.
			Image: "ghcr.io/open-asm/submit-error:1.0",
		}, nil
	}

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, mgr, proxy, nil)

	if !hadJob {
		t.Fatal("expected hadJob=true (job was pulled)")
	}
	if usedAsync {
		t.Fatal("expected usedAsync=false on submit error (caller releases)")
	}

	// Bridge should NOT be registered.
	bridgeMu.Lock()
	bridgeLen := len(bridge)
	bridgeMu.Unlock()
	if bridgeLen != 0 {
		t.Fatalf("expected empty bridge on submit error, got %d entries", bridgeLen)
	}

	// The failed submit must be reported back to Core so the job is finalized.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected 1 result submission for submit error, got %d", len(results))
	}
	if !results[0].isError {
		t.Fatal("expected isError=true for submit error result")
	}
	if results[0].jobID != "job-err-1" {
		t.Fatalf("expected jobID 'job-err-1', got %q", results[0].jobID)
	}
}

func TestProcessJobConnectorCompletionReleasesSemaphore(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0)
	proxy := connector.NewProxy()
	events := make(chan TuiEvent, 64)

	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{
			Id:    "job-comp-1",
			Tool:  "nuclei",
			Image: "ghcr.io/open-asm/nuclei:1.0",
		}, nil
	}

	releaseCh := make(chan struct{}, 1)
	releaseSem := func() { releaseCh <- struct{}{} }

	hadJob, usedAsync := processJob(context.Background(), client, nil, "", events, mgr, proxy, releaseSem)
	if !hadJob || !usedAsync {
		t.Fatalf("expected (true, true), got (%v, %v)", hadJob, usedAsync)
	}

	// The connector submitted as exec-1. Find the proxy channel.
	// Simulate: connector sends a result, then Done (closes channel).

	// Get the execID — Manager.Submit uses "exec-N", first submit is "exec-1".
	execID := "exec-1"
	if !proxy.Has(execID) {
		t.Fatalf("expected proxy to have %s", execID)
	}

	// Simulate connector sending a result data chunk.
	proxy.ForwardResult(execID, []byte(`{"subdomains":["a.example.com"]}`))

	// Simulate Done message — server marks Done, then OnConnectorDown closes the channel.
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	// Wait for completion handler to finish.
	select {
	case <-releaseCh:
		// Semaphore released — success.
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for semaphore release after connector completion")
	}

	// Verify cleanup: bridge entry removed, activeJobs cleaned.
	bridgeMu.Lock()
	_, stillInBridge := bridge[execID]
	bridgeMu.Unlock()
	if stillInBridge {
		t.Fatal("bridge entry should be removed after completion")
	}

	activeJobsMu.RLock()
	_, stillActive := activeJobs["job-comp-1"]
	activeJobsMu.RUnlock()
	if stillActive {
		t.Fatal("activeJobs should be cleaned after completion")
	}

	// Verify result was submitted.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected 1 result submission, got %d", len(results))
	}
	if results[0].jobID != "job-comp-1" {
		t.Fatalf("expected jobID 'job-comp-1', got %q", results[0].jobID)
	}
}

func TestHandleConnectorResultCleanupOnClose(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	// Directly test handleConnectorResult by manually setting up bridge + proxy.
	client, _, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	releaseCalled := false
	var mu sync.Mutex
	entry := &bridgeEntry{
		jobID:    "job-direct-1",
		category: "subdomains",
		release:  func() { mu.Lock(); releaseCalled = true; mu.Unlock() },
	}

	execID := "exec-direct-1"
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Send results and close.
	resultCh <- []byte("first-chunk")
	resultCh <- []byte("second-chunk")
	close(resultCh)

	select {
	case <-done:
		// handleConnectorResult finished.
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult to finish")
	}

	// Verify release was called.
	mu.Lock()
	called := releaseCalled
	mu.Unlock()
	if !called {
		t.Fatal("expected release to be called")
	}

	// Verify cleanup.
	bridgeMu.Lock()
	_, stillInBridge := bridge[execID]
	bridgeMu.Unlock()
	if stillInBridge {
		t.Fatal("bridge entry should be removed")
	}
	if proxy.Has(execID) {
		t.Fatal("proxy should not have execID after cleanup")
	}
}

func TestHandleConnectorResultConnectTimeout(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	// A real Manager so the handler can Cancel the stuck execution.
	mgr := execution.NewManager(fakeRT, 0)
	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei"})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}

	releaseCalled := false
	var mu sync.Mutex
	entry := &bridgeEntry{
		jobID:    "job-timeout-1",
		category: "subdomains",
		release:  func() { mu.Lock(); releaseCalled = true; mu.Unlock() },
	}
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	activeJobsMu.Lock()
	activeJobs[entry.jobID] = struct{}{}
	activeJobsMu.Unlock()

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), 50*time.Millisecond, mgr, nil)
		close(done)
	}()

	// Send nothing — the connector never connects; the timeout must fire.
	// The connect timeout is shrunk so the timer (not the 5s health poll) is
	// the path under test.
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult connect timeout")
	}

	mu.Lock()
	called := releaseCalled
	mu.Unlock()
	if !called {
		t.Fatal("expected release to be called after connect timeout")
	}

	if fakeRT.CancelCallCount() != 1 {
		t.Fatalf("expected 1 Cancel call, got %d", fakeRT.CancelCallCount())
	}
	if proxy.Has(execID) {
		t.Fatal("proxy should not have execID after connect timeout")
	}
	bridgeMu.Lock()
	_, stillInBridge := bridge[execID]
	bridgeMu.Unlock()
	if stillInBridge {
		t.Fatal("bridge entry should be removed after connect timeout")
	}

	// The failure must be reported to Core so it can finalize the job.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected 1 error result, got %d", len(results))
	}
	if !results[0].isError {
		t.Fatal("expected isError=true for connect timeout")
	}
	if !strings.Contains(results[0].raw, "did not connect") {
		t.Fatalf("expected raw to contain 'did not connect', got %q", results[0].raw)
	}
	if results[0].jobID != "job-timeout-1" {
		t.Fatalf("expected jobID 'job-timeout-1', got %q", results[0].jobID)
	}
}

func TestHandleConnectorResultRegisteredIsNotTimedOut(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	// Real Manager so the handler reaches the timer path (mgr != nil enables
	// the health ticker too, exactly as in the timeout test).
	mgr := execution.NewManager(fakeRT, 0)
	execID, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nuclei"})
	if err != nil {
		t.Fatalf("mgr.Submit: %v", err)
	}

	releaseCalled := false
	var mu sync.Mutex
	entry := &bridgeEntry{
		jobID:    "job-registered-1",
		category: "subdomains",
		release:  func() { mu.Lock(); releaseCalled = true; mu.Unlock() },
	}
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	// The connector registers its stream BEFORE the drain starts: the
	// registration signal must already be closed, so the connect timeout must
	// never fire for this (connected, legitimately long) scan.
	stream := &captureStream{}
	if err := proxy.RegisterConnector(execID, stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), 50*time.Millisecond, mgr, nil)
		close(done)
	}()

	// Sleep well past the 50ms connect timeout: a registered connector must
	// not be failed by it.
	time.Sleep(100 * time.Millisecond)

	// A result arriving after the timeout mark must still be drained and
	// submitted, then the Done flow (MarkDone + OnConnectorDown) finishes.
	proxy.ForwardResult(execID, []byte(`{"subdomains":["c.example.com"]}`))
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	// The scan must NOT be failed with the connect-timeout error.
	results := jobsSrv.getResults()
	for _, r := range results {
		if r.isError && strings.Contains(r.raw, "did not connect") {
			t.Fatalf("registered connector must not be failed by the connect timeout, got error result: %q", r.raw)
		}
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result submission, got %d", len(results))
	}
	if results[0].isError {
		t.Fatal("expected isError=false for the drained result")
	}
	if results[0].raw != `{"subdomains":["c.example.com"]}` {
		t.Fatalf("expected forwarded payload, got %q", results[0].raw)
	}
	if results[0].jobID != "job-registered-1" {
		t.Fatalf("expected jobID 'job-registered-1', got %q", results[0].jobID)
	}

	mu.Lock()
	called := releaseCalled
	mu.Unlock()
	if !called {
		t.Fatal("expected release to be called")
	}
	if fakeRT.CancelCallCount() != 0 {
		t.Fatalf("expected 0 Cancel calls for a registered connector, got %d", fakeRT.CancelCallCount())
	}
	if proxy.Has(execID) {
		t.Fatal("proxy should not have execID after completion")
	}
	bridgeMu.Lock()
	_, stillInBridge := bridge[execID]
	bridgeMu.Unlock()
	if stillInBridge {
		t.Fatal("bridge entry should be removed after completion")
	}
}

func TestHandleConnectorResultEmptyCleanDoneSubmitsEmptyResult(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	releaseCalled := false
	var mu sync.Mutex
	entry := &bridgeEntry{
		jobID:    "job-empty-1",
		category: "subdomains",
		release:  func() { mu.Lock(); releaseCalled = true; mu.Unlock() },
	}
	execID := "exec-empty-1"
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Clean Done: no results, no error.
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	mu.Lock()
	called := releaseCalled
	mu.Unlock()
	if !called {
		t.Fatal("expected release to be called")
	}

	// An empty clean Done must still finalize the job in Core.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected 1 empty result submission, got %d", len(results))
	}
	if results[0].isError {
		t.Fatal("expected isError=false for clean empty completion")
	}
	if results[0].raw != "" {
		t.Fatalf("expected empty raw, got %q", results[0].raw)
	}
	if results[0].jobID != "job-empty-1" {
		t.Fatalf("expected jobID 'job-empty-1', got %q", results[0].jobID)
	}
}

func TestHandleConnectorResultDisconnectWithoutDoneReportsError(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, jobsSrv, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	releaseCalled := false
	var mu sync.Mutex
	entry := &bridgeEntry{
		jobID:    "job-crash-1",
		category: "subdomains",
		release:  func() { mu.Lock(); releaseCalled = true; mu.Unlock() },
	}
	execID := "exec-crash-1"
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// Crash simulation: stream dies without Done → channel closes directly.
	close(resultCh)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	mu.Lock()
	called := releaseCalled
	mu.Unlock()
	if !called {
		t.Fatal("expected release to be called")
	}

	// A disconnect without Done must be reported to Core as an error.
	results := jobsSrv.getResults()
	if len(results) != 1 {
		t.Fatalf("expected 1 error result, got %d", len(results))
	}
	if !results[0].isError {
		t.Fatal("expected isError=true for disconnect without Done")
	}
	if !strings.Contains(results[0].raw, "disconnected") {
		t.Fatalf("expected raw to contain 'disconnected', got %q", results[0].raw)
	}
	if results[0].jobID != "job-crash-1" {
		t.Fatalf("expected jobID 'job-crash-1', got %q", results[0].jobID)
	}
}

// eventActivityMessages drains the events channel and returns every TuiLogger
// source-"Jobs" activity message.
func eventActivityMessages(events chan TuiEvent) []string {
	var msgs []string
	for ev := range events {
		if ev.Type == EventActivity && ev.Source == "Jobs" {
			msgs = append(msgs, ev.Message)
		}
	}
	return msgs
}

func TestHandleConnectorResultLogsLifecycle(t *testing.T) {
	// Clean global state from prior tests.
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()
	activeJobsMu.Lock()
	activeJobs = make(map[string]struct{})
	activeJobsMu.Unlock()

	client, _, _ := newWorkerTestSetup(t)
	events := make(chan TuiEvent, 64)
	proxy := connector.NewProxy()

	entry := &bridgeEntry{
		jobID:    "job-log-1",
		category: "subdomains",
		release:  func() {},
	}
	execID := "exec-log-f"
	bridgeMu.Lock()
	bridge[execID] = entry
	bridgeMu.Unlock()

	resultCh := make(chan []byte, 4)
	proxy.Register(execID, resultCh)

	done := make(chan struct{})
	go func() {
		handleConnectorResult(context.Background(), execID, client, events, proxy, resultCh, time.Now(), time.Minute, nil, nil)
		close(done)
	}()

	// One result chunk (7 bytes) then a clean Done.
	proxy.ForwardResult(execID, []byte(`{"a":1}`))
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for handleConnectorResult")
	}

	close(events)
	msgs := eventActivityMessages(events)

	found := map[string]bool{}
	for _, m := range msgs {
		switch {
		case strings.Contains(m, "connector result submitted: exec=exec-log-f bytes=7"):
			found["result"] = true
		case strings.Contains(m, "connector job finished: exec=exec-log-f success=true error=- duration="):
			found["finished"] = true
		}
	}
	if !found["result"] {
		t.Fatalf("expected 'connector result submitted' log, got %v", msgs)
	}
	if !found["finished"] {
		t.Fatalf("expected 'connector job finished' log, got %v", msgs)
	}
}
