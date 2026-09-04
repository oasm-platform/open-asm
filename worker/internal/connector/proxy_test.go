package connector

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"google.golang.org/grpc/metadata"

	pb "oasm-worker/internal/gen/connector"
)

// captureLogger records Info/Warning lines for asserting connector logs.
type captureLogger struct {
	mu     sync.Mutex
	levels []string
	lines  []string
}

func (c *captureLogger) Info(msg string, args ...any) { c.add("info", msg, args...) }
func (c *captureLogger) Warning(msg string, args ...any) {
	c.add("warning", msg, args...)
}

func (c *captureLogger) add(level, msg string, args ...any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.levels = append(c.levels, level)
	c.lines = append(c.lines, fmt.Sprintf(msg, args...))
}

func (c *captureLogger) all() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	cp := make([]string, len(c.lines))
	copy(cp, c.lines)
	return cp
}

func (c *captureLogger) find(substr string) (string, bool) {
	for _, l := range c.all() {
		if strings.Contains(l, substr) {
			return l, true
		}
	}
	return "", false
}

func TestProxyForwardsResult(t *testing.T) {
	p := NewProxy()
	ch := make(chan ResultMsg, 1)
	p.Register("exec-1", ch)
	p.ForwardResult("exec-1", []byte(`{"ok":true}`), []*pb.Finding{{Name: "f1"}})
	got := <-ch
	if string(got.Data) != `{"ok":true}` {
		t.Fatalf("forward mismatch: %s", got.Data)
	}
	if len(got.Findings) != 1 || got.Findings[0].GetName() != "f1" {
		t.Fatalf("findings not forwarded: %v", got.Findings)
	}
}

func TestProxyDropsUnknownExecution(t *testing.T) {
	p := NewProxy()
	p.ForwardResult("unknown", []byte(`x`), nil)
}

// ForwardResult must BLOCK (not drop) when the result channel is full: the
// drain loop is the sole consumer and always drains until close, so a fast
// scanner filling the 16-slot buffer must never lose results to a
// select-default send.
func TestForwardResultBlocksWhenChannelFull(t *testing.T) {
	p := NewProxy()
	ch := make(chan ResultMsg, 2)
	p.Register("exec-1", ch)

	done := make(chan struct{})
	go func() {
		p.ForwardResult("exec-1", []byte("one"), nil)
		p.ForwardResult("exec-1", []byte("two"), nil)
		p.ForwardResult("exec-1", []byte("three"), nil)
		close(done)
	}()

	// The first two sends fill the buffer; the third must stay blocked until
	// a reader drains. A select-default send would return immediately here.
	select {
	case <-done:
		t.Fatal("third ForwardResult must block while the channel is full — the current select-default silently drops results")
	case <-time.After(50 * time.Millisecond):
	}

	// Unblock by draining one element; the third send must now complete.
	if got := <-ch; string(got.Data) != "one" {
		t.Fatalf("first result mismatch: %q", got.Data)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("blocked ForwardResult must unblock once a reader drains the channel")
	}

	// All three payloads must arrive intact, in order.
	if got := <-ch; string(got.Data) != "two" {
		t.Fatalf("second result mismatch: %q", got.Data)
	}
	if got := <-ch; string(got.Data) != "three" {
		t.Fatalf("third result mismatch: %q", got.Data)
	}
}

func TestSetErrorAndPopError(t *testing.T) {
	p := NewProxy()

	// Pop on empty returns false.
	if _, ok := p.PopError("exec-x"); ok {
		t.Fatal("PopError on empty should return false")
	}

	// Set then Pop round-trip.
	p.SetError("exec-1", "container failed")
	msg, ok := p.PopError("exec-1")
	if !ok {
		t.Fatal("PopError should return true after SetError")
	}
	if msg != "container failed" {
		t.Fatalf("expected 'container failed', got %q", msg)
	}

	// Second Pop returns false (consumed).
	if _, ok := p.PopError("exec-1"); ok {
		t.Fatal("PopError should return false after first Pop")
	}
}

// fakeConnectStream is an in-memory pb.ConnectorService_ConnectServer that
// captures every WorkerMessage the proxy sends down the stream.
type fakeConnectStream struct {
	mu   sync.Mutex
	sent []*pb.WorkerMessage
}

var _ pb.ConnectorService_ConnectServer = (*fakeConnectStream)(nil)

func (f *fakeConnectStream) Send(m *pb.WorkerMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, m)
	return nil
}

func (f *fakeConnectStream) Recv() (*pb.ConnectorMessage, error) {
	return nil, nil
}

func (f *fakeConnectStream) SetHeader(metadata.MD) error  { return nil }
func (f *fakeConnectStream) SendHeader(metadata.MD) error { return nil }
func (f *fakeConnectStream) SetTrailer(metadata.MD)       {}
func (f *fakeConnectStream) Context() context.Context     { return context.Background() }
func (f *fakeConnectStream) SendMsg(any) error            { return nil }
func (f *fakeConnectStream) RecvMsg(any) error            { return nil }

// sentExecutes returns the ExecuteJob messages sent on the stream.
func (f *fakeConnectStream) sentExecutes() []*pb.ExecuteJob {
	f.mu.Lock()
	defer f.mu.Unlock()
	var jobs []*pb.ExecuteJob
	for _, m := range f.sent {
		if ex := m.GetExecute(); ex != nil {
			jobs = append(jobs, ex)
		}
	}
	return jobs
}

func (f *fakeConnectStream) sentCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sent)
}

func sampleExecuteJob() *pb.ExecuteJob {
	return &pb.ExecuteJob{
		ExecutionId: "exec-1",
		JobId:       "job-1",
		Tool:        "nuclei",
		Image:       "ghcr.io/open-asm/nuclei:1.0",
		TraceId:     "trace-1",
		Inputs:      map[string]string{"target": "https://example.com"},
	}
}

func TestSendExecuteBeforeRegisterQueuesPending(t *testing.T) {
	p := NewProxy()
	job := sampleExecuteJob()

	// No stream yet (container still booting) — must not error and must hold pending.
	if err := p.SendExecute("exec-1", job); err != nil {
		t.Fatalf("SendExecute before register: %v", err)
	}
	if p.HasStream("exec-1") {
		t.Fatal("no stream should be registered yet")
	}

	// Connector connects later — pending job must be flushed.
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	jobs := stream.sentExecutes()
	if len(jobs) != 1 {
		t.Fatalf("expected 1 flushed ExecuteJob, got %d", len(jobs))
	}
	assertExecuteJob(t, jobs[0], job)
}

func TestRegisterConnectorFlushesPendingExactlyOnce(t *testing.T) {
	p := NewProxy()
	job := sampleExecuteJob()
	if err := p.SendExecute("exec-1", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}

	streamA := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", streamA); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if len(streamA.sentExecutes()) != 1 {
		t.Fatalf("expected streamA to receive the pending ExecuteJob")
	}

	// A second registration (reconnect) must not resend — pending was consumed.
	streamB := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", streamB); err != nil {
		t.Fatalf("second RegisterConnector: %v", err)
	}
	if streamB.sentCount() != 0 {
		t.Fatalf("expected streamB to receive nothing, got %d messages", streamB.sentCount())
	}
}

func TestSendExecuteAfterRegisterSendsImmediately(t *testing.T) {
	p := NewProxy()
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	job := sampleExecuteJob()
	if err := p.SendExecute("exec-1", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}
	jobs := stream.sentExecutes()
	if len(jobs) != 1 {
		t.Fatalf("expected 1 immediate ExecuteJob, got %d", len(jobs))
	}
	assertExecuteJob(t, jobs[0], job)
}

func TestUnregisterConnectorRemovesStream(t *testing.T) {
	p := NewProxy()
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if !p.HasStream("exec-1") {
		t.Fatal("expected HasStream=true after register")
	}

	p.UnregisterConnector("exec-1")
	if p.HasStream("exec-1") {
		t.Fatal("expected HasStream=false after unregister")
	}

	// After unregister, SendExecute must queue pending again (no stale stream).
	if err := p.SendExecute("exec-1", sampleExecuteJob()); err != nil {
		t.Fatalf("SendExecute after unregister: %v", err)
	}
	if stream.sentCount() != 0 {
		t.Fatalf("expected no send on unregistered stream, got %d", stream.sentCount())
	}
}

func TestConnectorStreamRoutingIgnoresEmptyExecID(t *testing.T) {
	p := NewProxy()
	stream := &fakeConnectStream{}

	// Register with empty execID: legacy connectors send Register{token} only.
	if err := p.RegisterConnector("", stream); err != nil {
		t.Fatalf("RegisterConnector(\"\"): %v", err)
	}
	if p.HasStream("") {
		t.Fatal("empty execID must not be tracked as a stream")
	}

	if err := p.SendExecute("", sampleExecuteJob()); err != nil {
		t.Fatalf("SendExecute(\"\"): %v", err)
	}
	stream2 := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-2", stream2); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if stream2.sentCount() != 0 {
		t.Fatal("empty-execID SendExecute must not be queued under another execID")
	}
}

func assertExecuteJob(t *testing.T, got, want *pb.ExecuteJob) {
	t.Helper()
	if got.GetExecutionId() != want.GetExecutionId() {
		t.Errorf("ExecutionId: got %q, want %q", got.GetExecutionId(), want.GetExecutionId())
	}
	if got.GetJobId() != want.GetJobId() {
		t.Errorf("JobId: got %q, want %q", got.GetJobId(), want.GetJobId())
	}
	if got.GetTool() != want.GetTool() {
		t.Errorf("Tool: got %q, want %q", got.GetTool(), want.GetTool())
	}
	if got.GetImage() != want.GetImage() {
		t.Errorf("Image: got %q, want %q", got.GetImage(), want.GetImage())
	}
	if got.GetTraceId() != want.GetTraceId() {
		t.Errorf("TraceId: got %q, want %q", got.GetTraceId(), want.GetTraceId())
	}
	if len(got.GetInputs()) != len(want.GetInputs()) {
		t.Fatalf("Inputs: got %v, want %v", got.GetInputs(), want.GetInputs())
	}
	for k, v := range want.GetInputs() {
		if got.GetInputs()[k] != v {
			t.Errorf("Inputs[%q]: got %q, want %q", k, got.GetInputs()[k], v)
		}
	}
}

func TestProxyLogsExecuteQueuedThenFlushed(t *testing.T) {
	p := NewProxy()
	log := &captureLogger{}
	p.SetLogger(log)
	job := sampleExecuteJob()

	// No stream yet — SendExecute must queue and log "queued".
	if err := p.SendExecute("exec-1", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}
	line, ok := log.find("connector execute queued: exec=exec-1")
	if !ok {
		t.Fatalf("expected 'queued' log line, got %v", log.all())
	}

	// Connector connects — pending flush must log "flushed".
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	line, ok = log.find("connector execute flushed: exec=exec-1")
	if !ok {
		t.Fatalf("expected 'flushed' log line, got %v", log.all())
	}
	if !strings.Contains(line, "job=job-1") {
		t.Fatalf("flushed line must carry job id: %q", line)
	}
}

func TestProxyLogsExecuteSentImmediately(t *testing.T) {
	p := NewProxy()
	log := &captureLogger{}
	p.SetLogger(log)

	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if err := p.SendExecute("exec-1", sampleExecuteJob()); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}

	line, ok := log.find("connector execute sent: exec=exec-1")
	if !ok {
		t.Fatalf("expected 'sent' log line, got %v", log.all())
	}
	for _, want := range []string{"job=job-1", "tool=nuclei"} {
		if !strings.Contains(line, want) {
			t.Fatalf("sent line %q missing %q", line, want)
		}
	}
	if _, queued := log.find("queued"); queued {
		t.Fatal("immediate send must not log 'queued'")
	}
}

// A pending ExecuteJob (queued before the connector connected) must be dropped
// when the connector goes down: the job can never be delivered, and a later
// registration must not resurrect it. Otherwise pendings accumulate forever.
func TestOnConnectorDownClearsPending(t *testing.T) {
	p := NewProxy()
	job := sampleExecuteJob()

	// No stream yet — SendExecute holds the job as pending.
	if err := p.SendExecute("exec-1", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}

	// Connector dies before ever registering.
	p.OnConnectorDown("exec-1")

	// A late registration must NOT flush the dropped pending job.
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	if n := stream.sentCount(); n != 0 {
		t.Fatalf("expected 0 flushed ExecuteJobs after connector down, got %d", n)
	}
}

// Live-stream flush must survive OnConnectorDown: a stream that is registered
// (no pending) must keep delivering jobs after an unrelated down event.
func TestOnConnectorDownKeepsLiveStream(t *testing.T) {
	p := NewProxy()
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-2", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	// Down event for a different execution must not touch exec-2's stream.
	p.OnConnectorDown("exec-1")
	if !p.HasStream("exec-2") {
		t.Fatal("live stream must survive unrelated connector-down")
	}
	if err := p.SendExecute("exec-2", sampleExecuteJob()); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}
	if n := len(stream.sentExecutes()); n != 1 {
		t.Fatalf("expected 1 ExecuteJob on live stream, got %d", n)
	}
}

// racyConnectStream is fakeConnectStream WITHOUT the internal mutex: Send
// mutates the shared send state exactly like grpc-go's transport does when
// two goroutines send on the same stream concurrently (unsynchronized, and in
// real grpc-go an internal panic instead of a returned error). The race
// detector flags concurrent Sends on it — the failure mode the proxy must
// prevent.
type racyConnectStream struct {
	sent []*pb.WorkerMessage
}

var _ pb.ConnectorService_ConnectServer = (*racyConnectStream)(nil)

func (f *racyConnectStream) Send(m *pb.WorkerMessage) error {
	// Deliberately unsynchronized: -race must catch concurrent Send calls.
	f.sent = append(f.sent, m)
	return nil
}

func (f *racyConnectStream) Recv() (*pb.ConnectorMessage, error) {
	return nil, nil
}

func (f *racyConnectStream) SetHeader(metadata.MD) error  { return nil }
func (f *racyConnectStream) SendHeader(metadata.MD) error { return nil }
func (f *racyConnectStream) SetTrailer(metadata.MD)       {}
func (f *racyConnectStream) Context() context.Context     { return context.Background() }
func (f *racyConnectStream) SendMsg(any) error            { return nil }
func (f *racyConnectStream) RecvMsg(any) error            { return nil }

// TestProxyConcurrentSendDoesNotRace: N goroutines must be able to call
// SendExecute on the same live stream at once. grpc-go streams are not safe
// for concurrent Send — two parallel Sends can panic inside the transport
// instead of returning an error — so the proxy must serialize every
// stream.Send through one mutex (one Send at a time). Run with -race.
func TestProxyConcurrentSendDoesNotRace(t *testing.T) {
	p := NewProxy()
	stream := &racyConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	const n = 16
	var wg sync.WaitGroup
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs <- p.SendExecute("exec-1", &pb.ExecuteJob{
				ExecutionId: "exec-1",
				JobId:       fmt.Sprintf("job-%d", i),
				Tool:        "nuclei",
			})
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("SendExecute: %v", err)
		}
	}

	if got := len(stream.sent); got != n {
		t.Fatalf("expected %d ExecuteJobs delivered, got %d", n, got)
	}
	delivered := make(map[string]bool, n)
	for _, m := range stream.sent {
		delivered[m.GetExecute().GetJobId()] = true
	}
	for i := 0; i < n; i++ {
		if !delivered[fmt.Sprintf("job-%d", i)] {
			t.Fatalf("job-%d was not delivered", i)
		}
	}
}

// TestProxyConcurrentFlushAndSendDoesNotRace: the exact H3 hazard —
// RegisterConnector's pending flush (Connect handler goroutine) and
// SendExecute (job goroutine) both call stream.Send on the same stream. Both
// must be serialized: one Send at a time. Run with -race.
func TestProxyConcurrentFlushAndSendDoesNotRace(t *testing.T) {
	p := NewProxy()
	// One pending job (queued before the connector connected) + N job sends.
	if err := p.SendExecute("exec-1", sampleExecuteJob()); err != nil {
		t.Fatalf("pending SendExecute: %v", err)
	}

	stream := &racyConnectStream{}
	const n = 16
	var wg sync.WaitGroup
	errs := make(chan error, n+1)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			errs <- p.SendExecute("exec-1", &pb.ExecuteJob{
				ExecutionId: "exec-1",
				JobId:       fmt.Sprintf("job-%d", i),
				Tool:        "nuclei",
			})
		}(i)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		close(start) // release the senders exactly as the flush starts
		errs <- p.RegisterConnector("exec-1", stream)
	}()
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent flush/send: %v", err)
		}
	}

	// 1 pending flush + N immediate sends = N+1 deliveries, none lost.
	if got := len(stream.sent); got != n+1 {
		t.Fatalf("expected %d deliveries (1 flush + %d sends), got %d", n+1, n, got)
	}
	delivered := make(map[string]bool, n+1)
	for _, m := range stream.sent {
		delivered[m.GetExecute().GetJobId()] = true
	}
	if !delivered["job-1"] {
		t.Fatal("pending job (job-1) was not flushed")
	}
	for i := 0; i < n; i++ {
		if !delivered[fmt.Sprintf("job-%d", i)] {
			t.Fatalf("job-%d was not delivered", i)
		}
	}
}
