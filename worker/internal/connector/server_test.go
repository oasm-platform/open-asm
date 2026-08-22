package connector

import (
	"context"
	"io"
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
	proxy := NewProxy()
	srv, err := NewServer("localhost:0", proxy, token)
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
	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	stream, err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}

	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Register{
			Register: &pb.Register{Token: token},
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

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

func TestServerHappyPath_RegisterResultDone(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegister(t, conn, "secret")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got accepted=%v reason=%q", ack.GetAccepted(), ack.GetReason())
	}

	// Register a channel to capture forwarded results.
	ch := make(chan []byte, 1)
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
		if string(got) != "hello" {
			t.Fatalf("expected 'hello', got %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for forwarded result")
	}

	// Send Done — server closes the stream.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}

	// Server returns nil on Done → stream closes → client sees EOF.
	_, err := stream.Recv()
	if err != io.EOF {
		t.Fatalf("expected EOF after Done, got %v", err)
	}

	// Verify proxy cleanup: channel closed, execution removed.
	if proxy.Has("exec-1") {
		t.Fatal("proxy should not retain exec-1 after Done")
	}
	_, ok := <-ch
	if ok {
		t.Fatal("channel should be closed after OnConnectorDown")
	}
}

func TestServerInvalidToken(t *testing.T) {
	srv, _ := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegister(t, conn, "wrong")
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

	stream, ack := connectAndRegister(t, conn, "")
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

	// Any token should be accepted.
	stream, ack := connectAndRegister(t, conn, "anything")
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

	stream, ack := connectAndRegister(t, conn, "secret")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got %v", ack.GetAccepted())
	}

	// Register capture channels for two executions.
	ch1 := make(chan []byte, 1)
	ch2 := make(chan []byte, 1)
	proxy.Register("exec-1", ch1)
	proxy.Register("exec-2", ch2)

	type result struct {
		execID string
		data   string
		ch     chan []byte
	}
	results := []result{
		{"exec-1", "first", ch1},
		{"exec-2", "second", ch2},
	}

	for _, r := range results {
		if err := stream.Send(&pb.ConnectorMessage{
			Message: &pb.ConnectorMessage_Result{
				Result: &pb.Result{ExecutionId: r.execID, Data: []byte(r.data)},
			},
		}); err != nil {
			t.Fatalf("Send Result for %s: %v", r.execID, err)
		}
	}

	// Verify both results arrived at the correct channels.
	for _, r := range results {
		select {
		case got := <-r.ch:
			if string(got) != r.data {
				t.Fatalf("exec %s: expected %q, got %q", r.execID, r.data, got)
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
	stream, ack := connectAndRegister(t, conn, "tok")
	if !ack.GetAccepted() {
		t.Fatal("expected accepted")
	}

	captured := make(chan []byte, 1)
	proxy.Register("exec-99", captured)

	// Send Result → verify ForwardResult called with correct execution_id and data.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Result{
			Result: &pb.Result{ExecutionId: "exec-99", Data: []byte("proxy-data")},
		},
	}); err != nil {
		t.Fatalf("Send Result: %v", err)
	}

	select {
	case got := <-captured:
		if string(got) != "proxy-data" {
			t.Fatalf("ForwardResult data mismatch: got %q", got)
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
