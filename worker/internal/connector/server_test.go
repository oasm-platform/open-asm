package connector

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	pb "oasm-worker/internal/gen/connector"
)

// startTestServer creates a server on a random port with the given token and
// registers cleanup to stop it when the test ends.
func startTestServer(t *testing.T, token string) (*Server, *Proxy) {
	t.Helper()
	return startTestServerWithLookup(t, token, nil)
}

// startTestServerWithLookup is startTestServer with a TokenLookup wired via
// SetTokenLookup (per-execution single-use token mode).
func startTestServerWithLookup(t *testing.T, token string, lookup TokenLookup) (*Server, *Proxy) {
	t.Helper()
	proxy := NewProxy()
	srv, err := NewServer("localhost:0", proxy, token)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	if lookup != nil {
		srv.SetTokenLookup(lookup)
	}
	ctx, cancel := context.WithCancel(context.Background())
	served := make(chan struct{})
	go func() {
		_ = srv.Serve(ctx)
		close(served)
	}()
	t.Cleanup(func() {
		cancel()
		<-served
	})
	return srv, proxy
}

// dialTestServer opens a gRPC client connection to the server.
func dialTestServer(t *testing.T, srv *Server) *grpc.ClientConn {
	t.Helper()
	conn, err := grpc.NewClient(
		srv.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("grpc.NewClient: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

// connectAndRegister opens a bidi stream, sends Register, and returns the stream.
func connectAndRegister(t *testing.T, conn *grpc.ClientConn, token string) (grpc.BidiStreamingClient[pb.ConnectorMessage, pb.WorkerMessage], *pb.RegisterAck) {
	t.Helper()
	return connectAndRegisterWithExecID(t, conn, token, "")
}

// connectAndRegisterWithExecID is connectAndRegister with an optional
// execution_id advertised in the Register message.
func connectAndRegisterWithExecID(t *testing.T, conn *grpc.ClientConn, token, execID string) (grpc.BidiStreamingClient[pb.ConnectorMessage, pb.WorkerMessage], *pb.RegisterAck) {
	t.Helper()
	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	stream, err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}

	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Register{
			Register: &pb.Register{Token: token, ExecutionId: execID},
		},
	}); err != nil {
		t.Fatalf("Send Register: %v", err)
	}

	ack, err := stream.Recv()
	if err != nil {
		t.Fatalf("Recv RegisterAck: %v", err)
	}
	return stream, ack.GetRegisterAck()
}

// Register without execution_id must be rejected: without it the server has no
// way to route ExecuteJob/Result messages to the right execution (the execID
// is worker-assigned), and an unmapped stream would silently misroute.
func TestServerRegisterWithEmptyExecIDRejected(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegister(t, conn, "secret") // empty execution_id
	if ack.GetAccepted() {
		t.Fatalf("expected accepted=false for empty execution_id, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}
	if ack.GetReason() != "execution_id required" {
		t.Fatalf("expected reason='execution_id required', got %q", ack.GetReason())
	}
	if proxy.HasStream("") {
		t.Fatal("empty execution_id must not be mapped as a stream")
	}

	// Server closes the stream after the reject ack.
	if _, err := stream.Recv(); err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

func TestServerHappyPath_RegisterResultDone(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}

	// Register a channel to capture forwarded results.
	ch := make(chan ResultMsg, 1)
	proxy.Register("exec-1", ch)

	// Send Result.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Result{
			Result: &pb.Result{ExecutionId: "exec-1", Data: []byte("hello")},
		},
	}); err != nil {
		t.Fatalf("Send Result: %v", err)
	}

	select {
	case got := <-ch:
		if string(got.Data) != "hello" {
			t.Fatalf("expected 'hello', got %q", got.Data)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for forwarded result")
	}

	// Send Done — execution over.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}

	// Verify proxy cleanup of the EXECUTION: channel closed, execution removed
	// (OnConnectorDown still fires on Done). The channel close proves the
	// server already processed the Done — checked BEFORE the Has assertion to
	// avoid racing the handler goroutine.
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("channel should be closed after OnConnectorDown")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for channel close")
	}
	if proxy.Has("exec-1") {
		t.Fatal("proxy should not retain exec-1 after Done")
	}

	// Phase 2 warm pool: the STREAM stays open for reuse — no EOF after Done.
	recvCh := make(chan error, 1)
	go func() {
		_, err := stream.Recv()
		recvCh <- err
	}()
	select {
	case err := <-recvCh:
		t.Fatalf("stream must stay open after Done, got %v", err)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestServerDoneMarksProxyDone(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-mark-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}

	// Clean Done — the server records it via proxy.MarkDone. The stream does
	// NOT close (Phase 2 pool reuse), so poll the flag instead of expecting
	// EOF.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-mark-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for !proxy.PopDone("exec-mark-1") {
		if time.Now().After(deadline) {
			t.Fatal("PopDone must be true shortly after a clean Done message")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestServerInvalidToken(t *testing.T) {
	srv, _ := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "wrong", "exec-invalid-1")
	if ack.GetAccepted() {
		t.Fatal("expected accepted=false for wrong token")
	}
	if ack.GetReason() != "invalid token" {
		t.Fatalf("expected reason='invalid token', got %q", ack.GetReason())
	}

	// Server closes the stream after sending the reject ack.
	_, err := stream.Recv()
	if err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}

func TestServerEmptyTokenWhenAuthRequired(t *testing.T) {
	srv, _ := startTestServer(t, "required-token")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "", "exec-empty-tok-1")
	if ack.GetAccepted() {
		t.Fatal("expected accepted=false for empty token when auth required")
	}

	// Stream should close after rejection.
	_, err := stream.Recv()
	if err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}

func TestServerNoAuthRequired(t *testing.T) {
	srv, _ := startTestServer(t, "") // empty token = no auth (dev mode)
	conn := dialTestServer(t, srv)

	// Any token should be accepted for a registered execution.
	stream, ack := connectAndRegisterWithExecID(t, conn, "anything", "exec-noauth-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true with no auth, got accepted=%v", ack.GetAccepted())
	}

	// Clean up: send Done so the server exits the read loop.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "noop"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
}

func TestServerFirstMessageNotRegister(t *testing.T) {
	srv, _ := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stream, err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}

	// Send Result as the first message (expected Register).
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Result{
			Result: &pb.Result{ExecutionId: "exec-x", Data: []byte("bad")},
		},
	}); err != nil {
		t.Fatalf("Send Result: %v", err)
	}

	// Server should return InvalidArgument.
	_, err = stream.Recv()
	if err == nil {
		t.Fatal("expected error for non-Register first message")
	}
	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}
	if st.Code() != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", st.Code())
	}
	if st.Message() != "first message must be Register" {
		t.Fatalf("unexpected error message: %q", st.Message())
	}
}

func TestServerMultipleResults(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got %v", ack.GetAccepted())
	}

	// Register capture channels for two executions.
	ch1 := make(chan ResultMsg, 1)
	ch2 := make(chan ResultMsg, 1)
	proxy.Register("exec-1", ch1)
	proxy.Register("exec-2", ch2)

	type result struct {
		execID string
		data   string
		find   string
		ch     chan ResultMsg
	}
	results := []result{
		{"exec-1", "first", "", ch1},
		{"exec-2", "second", "f2", ch2},
	}

	for _, r := range results {
		if err := stream.Send(&pb.ConnectorMessage{
			Message: &pb.ConnectorMessage_Result{
				Result: &pb.Result{ExecutionId: r.execID, Data: []byte(r.data), Findings: []*pb.Finding{{Name: r.find}}},
			},
		}); err != nil {
			t.Fatalf("Send Result for %s: %v", r.execID, err)
		}
	}

	// Verify both results arrived at the correct channels.
	for _, r := range results {
		select {
		case got := <-r.ch:
			if string(got.Data) != r.data {
				t.Fatalf("exec %s: expected %q, got %q", r.execID, r.data, got.Data)
			}
			if len(got.Findings) != 1 || got.Findings[0].GetName() != r.find {
				t.Fatalf("exec %s: findings not forwarded: %v", r.execID, got.Findings)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timeout waiting for result on exec %s", r.execID)
		}
	}

	// Clean up with Done.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
}

func TestServerProxyInteraction(t *testing.T) {
	proxy := NewProxy()
	srv, err := NewServer("localhost:0", proxy, "tok")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	served := make(chan struct{})
	go func() {
		_ = srv.Serve(ctx)
		close(served)
	}()
	t.Cleanup(func() {
		cancel()
		<-served
	})

	conn := dialTestServer(t, srv)
	stream, ack := connectAndRegisterWithExecID(t, conn, "tok", "exec-99")
	if !ack.GetAccepted() {
		t.Fatal("expected accepted")
	}

	captured := make(chan ResultMsg, 1)
	proxy.Register("exec-99", captured)

	// Send Result → verify ForwardResult called with correct execution_id and data.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Result{
			Result: &pb.Result{ExecutionId: "exec-99", Data: []byte("proxy-data"), Findings: []*pb.Finding{{Name: "proxy-f"}}},
		},
	}); err != nil {
		t.Fatalf("Send Result: %v", err)
	}

	select {
	case got := <-captured:
		if string(got.Data) != "proxy-data" {
			t.Fatalf("ForwardResult data mismatch: got %q", got.Data)
		}
		if len(got.Findings) != 1 || got.Findings[0].GetName() != "proxy-f" {
			t.Fatalf("ForwardResult findings mismatch: got %v", got.Findings)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout: ForwardResult not called")
	}

	// Send Done → verify OnConnectorDown called.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-99"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}

	// Channel closed, execution removed.
	_, ok := <-captured
	if ok {
		t.Fatal("channel should be closed after OnConnectorDown")
	}
	if proxy.Has("exec-99") {
		t.Fatal("proxy should not retain exec-99 after OnConnectorDown")
	}
}

func TestServerRegisterWithExecutionIDMapsStream(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-map-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}

	// The stream must be registered in the proxy so ExecuteJob can be routed.
	if !proxy.HasStream("exec-map-1") {
		t.Fatal("expected proxy stream registration for execution_id")
	}

	// A pending ExecuteJob sent before/without a stream must flush on register.
	job := &pb.ExecuteJob{ExecutionId: "exec-map-1", JobId: "job-map-1", Tool: "nuclei"}
	if err := proxy.SendExecute("exec-map-1", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}

	// The connector side must receive the flushed ExecuteJob on its stream.
	wm, err := stream.Recv()
	if err != nil {
		t.Fatalf("Recv ExecuteJob: %v", err)
	}
	ex := wm.GetExecute()
	if ex == nil {
		t.Fatal("expected ExecuteJob message on stream")
	}
	if ex.GetExecutionId() != "exec-map-1" || ex.GetJobId() != "job-map-1" || ex.GetTool() != "nuclei" {
		t.Fatalf("unexpected ExecuteJob payload: %+v", ex)
	}

	// Clean Done ends the execution; the stream stays registered (warm pool
	// reuse) — the container survives for the next ExecuteJob.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-map-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
	// Phase 2: no EOF after Done — the read loop continues.
	if !proxy.HasStream("exec-map-1") {
		t.Fatal("expected stream still registered after Done (pool reuse)")
	}
}

// (Legacy empty-execution_id acceptance is gone — TestServerRegisterWithEmptyExecIDRejected
// above asserts the new rejection; the old RegisterWithoutExecIDNoStreamMapping
// test was removed because accepting unmapped legacy streams is the misroute
// this change eliminates.)

func TestServerDisconnectUnregistersStream(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithCancel(context.Background())
	stream, err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Register{
			Register: &pb.Register{Token: "secret", ExecutionId: "exec-dis-1"},
		},
	}); err != nil {
		t.Fatalf("Send Register: %v", err)
	}
	if _, err := stream.Recv(); err != nil {
		t.Fatalf("Recv RegisterAck: %v", err)
	}
	if !proxy.HasStream("exec-dis-1") {
		t.Fatal("expected stream registered before disconnect")
	}

	// Kill the connection — server must unregister the stream on stream end.
	cancel()
	deadline := time.Now().Add(2 * time.Second)
	for proxy.HasStream("exec-dis-1") {
		if time.Now().After(deadline) {
			t.Fatal("stream not unregistered after disconnect")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// waitForLog polls until a captureLogger line contains substr (server logs are
// written on the gRPC handler goroutine — after the client sees the ack).
func waitForLog(t *testing.T, log *captureLogger, substr string) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if line, ok := log.find(substr); ok {
			return line
		}
		if time.Now().After(deadline) {
			t.Fatalf("log line %q not observed; got %v", substr, log.all())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestServerLogsRegisterAckAndDone(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	log := &captureLogger{}
	srv.SetLogger(log)
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-log-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got %v", ack.GetAccepted())
	}

	// Register received + accepted ack lines (execution identity present).
	regLine := waitForLog(t, log, "connector register: exec=exec-log-1")
	if !strings.Contains(regLine, "job=") || !strings.Contains(regLine, "tool=") {
		t.Fatalf("register line must carry job/tool identity: %q", regLine)
	}
	ackLine := waitForLog(t, log, "connector registered: exec=exec-log-1 ack=true")
	if !strings.Contains(ackLine, "reason=") {
		t.Fatalf("ack line must carry reason: %q", ackLine)
	}

	// Clean Done → "done" + unregister log lines.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-log-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
	doneLine := waitForLog(t, log, "connector done: exec=exec-log-1")
	if !strings.Contains(doneLine, "error=-") {
		t.Fatalf("clean done line must show dash error: %q", doneLine)
	}
	// Phase 2: the stream stays registered after Done (pool reuse) — the
	// connector keeps its read loop open for the next ExecuteJob.
	if !proxy.HasStream("exec-log-1") {
		t.Fatal("stream must stay registered after Done (pool reuse)")
	}
}

func TestServerLogsRejectedRegisterAsWarning(t *testing.T) {
	srv, _ := startTestServer(t, "secret")
	log := &captureLogger{}
	srv.SetLogger(log)
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "wrong", "exec-bad-tok")
	if ack.GetAccepted() {
		t.Fatal("expected accepted=false for wrong token")
	}

	// Registered execution identity in the register/reject log lines.
	waitForLog(t, log, "connector register: exec=exec-bad-tok")
	ackLine := waitForLog(t, log, "connector registered: exec=exec-bad-tok ack=false")
	if !strings.Contains(ackLine, "reason=invalid token") {
		t.Fatalf("reject ack line must carry reason: %q", ackLine)
	}
	if len(log.levels) < 2 || log.levels[len(log.levels)-1] != "warning" {
		t.Fatalf("rejected register must be logged as warning, got %v", log.levels)
	}

	// Stream closes after the reject ack.
	if _, err := stream.Recv(); err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}

func TestServerLogsStreamClosedOnDisconnect(t *testing.T) {
	srv, _ := startTestServer(t, "")
	log := &captureLogger{}
	srv.SetLogger(log)
	conn := dialTestServer(t, srv)

	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithCancel(context.Background())
	stream, err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Register{
			Register: &pb.Register{Token: "", ExecutionId: "exec-closed-1"},
		},
	}); err != nil {
		t.Fatalf("Send Register: %v", err)
	}
	if _, err := stream.Recv(); err != nil {
		t.Fatalf("Recv RegisterAck: %v", err)
	}

	// Kill the connection → server must log the closed stream (warning).
	cancel()
	waitForLog(t, log, "connector stream closed: exec=exec-closed-1")
}

// ---------------------------------------------------------------------------
// Per-execution single-use token mode (TokenLookup)
// ---------------------------------------------------------------------------

// fakeTokenLookup implements TokenLookup for tests: per-execution tokens keyed
// by execution_id.
type fakeTokenLookup struct {
	tokens map[string]string
}

func (f *fakeTokenLookup) ExecToken(execID string) (string, bool) {
	tok, ok := f.tokens[execID]
	return tok, ok
}

func TestServerPerExecTokenAccepted(t *testing.T) {
	srv, proxy := startTestServerWithLookup(t, "shared-secret", &fakeTokenLookup{
		tokens: map[string]string{"exec-tok-1": "t1"},
	})
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "t1", "exec-tok-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true with the matching per-execution token, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}
	if !proxy.HasStream("exec-tok-1") {
		t.Fatal("expected stream mapped after per-exec token accept")
	}

	// Clean up with Done so the read loop ends.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-tok-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
}

func TestServerPerExecTokenRejected(t *testing.T) {
	srv, _ := startTestServerWithLookup(t, "shared-secret", &fakeTokenLookup{
		tokens: map[string]string{"exec-tok-1": "t1"},
	})
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "wrong-token", "exec-tok-1")
	if ack.GetAccepted() {
		t.Fatal("expected accepted=false for a wrong per-execution token")
	}
	if ack.GetReason() != "invalid token" {
		t.Fatalf("expected reason='invalid token', got %q", ack.GetReason())
	}
	if _, err := stream.Recv(); err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}

func TestServerTokenFromAnotherExecRejected(t *testing.T) {
	// exec-a's token must not authenticate exec-b: tokens are per-execution
	// single-use, never interchangeable.
	srv, _ := startTestServerWithLookup(t, "shared-secret", &fakeTokenLookup{
		tokens: map[string]string{"exec-a": "t-a", "exec-b": "t-b"},
	})
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "t-a", "exec-b")
	if ack.GetAccepted() {
		t.Fatal("expected accepted=false when presenting another execution's token")
	}
	if ack.GetReason() != "invalid token" {
		t.Fatalf("expected reason='invalid token', got %q", ack.GetReason())
	}
	if _, err := stream.Recv(); err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}

func TestServerNoPerExecTokenFallsBackToShared(t *testing.T) {
	// An execution without a registered per-execution token falls back to the
	// legacy shared secret — and the shared secret is still enforced there.
	srv, proxy := startTestServerWithLookup(t, "shared-secret", &fakeTokenLookup{
		tokens: map[string]string{"exec-with-token": "t-x"},
	})
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "shared-secret", "exec-fallback-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true via shared-secret fallback, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}
	if !proxy.HasStream("exec-fallback-1") {
		t.Fatal("expected stream mapped after fallback accept")
	}

	// The same unknown execution with a wrong shared token must be rejected.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-fallback-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}

	conn2 := dialTestServer(t, srv)
	stream2, ack2 := connectAndRegisterWithExecID(t, conn2, "wrong-shared", "exec-fallback-2")
	if ack2.GetAccepted() {
		t.Fatal("expected accepted=false for wrong shared token on unknown execution")
	}
	if ack2.GetReason() != "invalid token" {
		t.Fatalf("expected reason='invalid token', got %q", ack2.GetReason())
	}
	if _, err := stream2.Recv(); err != io.EOF {
		t.Fatalf("expected EOF after rejected ack, got %v", err)
	}
}
