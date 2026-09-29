package grpcclient

import (
	"context"
	"net"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	stream "oasm-worker/internal/gen/worker_stream"
)

// fakeWorkerStreamServer plays core-api: it answers the register handshake and
// (optionally) pushes a cancellation down the same stream.
type fakeWorkerStreamServer struct {
	stream.UnimplementedWorkerStreamServiceServer

	accept         bool
	cancelJobID    string
	sendEmptyCancel bool
	registered     chan struct{}
}

func (f *fakeWorkerStreamServer) Connect(
	srv grpc.BidiStreamingServer[stream.WorkerToCore, stream.CoreToWorker],
) error {
	frame, err := srv.Recv()
	if err != nil {
		return err
	}
	if frame.GetRegister() == nil {
		return status.Error(codes.InvalidArgument, "first frame must be register")
	}
	if f.registered != nil {
		close(f.registered)
	}

	resp := &stream.RegisterResponse{
		WorkerId:            "worker-1",
		Accepted:            f.accept,
		HeartbeatIntervalMs: 1000,
	}
	if !f.accept {
		resp.Reason = "bad token"
	}
	if err := srv.Send(&stream.CoreToWorker{
		Payload: &stream.CoreToWorker_RegisterResp{RegisterResp: resp},
	}); err != nil {
		return err
	}
	if !f.accept {
		// Stay open so the client reliably processes the rejection instead of
		// racing a closed stream.
		<-srv.Context().Done()
		return srv.Context().Err()
	}

	if f.sendEmptyCancel {
		if err := srv.Send(&stream.CoreToWorker{
			Payload: &stream.CoreToWorker_Cancel{Cancel: &stream.CancelRequest{Reason: "x"}},
		}); err != nil {
			return err
		}
	}
	if f.cancelJobID != "" {
		if err := srv.Send(&stream.CoreToWorker{
			Payload: &stream.CoreToWorker_Cancel{
				Cancel: &stream.CancelRequest{JobId: f.cancelJobID, Reason: "cancelled by user"},
			},
		}); err != nil {
			return err
		}
	}

	<-srv.Context().Done()
	return srv.Context().Err()
}

func newStreamTestClient(t *testing.T, srv stream.WorkerStreamServiceServer) *Client {
	t.Helper()
	lis := bufconn.Listen(64 * 1024)
	grpcSrv := grpc.NewServer()
	stream.RegisterWorkerStreamServiceServer(grpcSrv, srv)
	go func() { _ = grpcSrv.Serve(lis) }()

	client, err := NewClient("test-api-key", "passthrough:///bufnet", "test-tools", &noOpLogger{},
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
	)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	client.tokenFile = filepath.Join(t.TempDir(), ".worker-token")
	t.Cleanup(func() {
		_ = client.Close()
		grpcSrv.Stop()
	})
	return client
}

func TestRunWorkerStream_DeliversCancelToHandler(t *testing.T) {
	srv := &fakeWorkerStreamServer{accept: true, cancelJobID: "job-1", registered: make(chan struct{})}
	client := newStreamTestClient(t, srv)

	received := make(chan string, 4)
	client.SetStreamCancelHandler(func(jobID, reason string) {
		received <- jobID + "|" + reason
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go func() { _ = client.RunWorkerStream(ctx, client.streamCancelHandler()) }()

	select {
	case <-srv.registered:
	case <-time.After(3 * time.Second):
		t.Fatal("register frame was never sent")
	}

	select {
	case got := <-received:
		if got != "job-1|cancelled by user" {
			t.Fatalf("cancel handler got %q, want %q", got, "job-1|cancelled by user")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancel was never delivered to the handler")
	}
}

func TestRunWorkerStream_RejectedRegisterFails(t *testing.T) {
	srv := &fakeWorkerStreamServer{accept: false}
	client := newStreamTestClient(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := client.RunWorkerStream(ctx, nil)
	if err == nil || !strings.Contains(err.Error(), "rejected") {
		t.Fatalf("expected a rejection error, got %v", err)
	}
	if !strings.Contains(err.Error(), "bad token") {
		t.Fatalf("expected the server reason to be surfaced, got %v", err)
	}
}

func TestRunWorkerStream_IgnoresCancelWithoutJobID(t *testing.T) {
	srv := &fakeWorkerStreamServer{accept: true, sendEmptyCancel: true}
	client := newStreamTestClient(t, srv)

	called := make(chan struct{}, 1)
	client.SetStreamCancelHandler(func(jobID, reason string) {
		called <- struct{}{}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = client.RunWorkerStream(ctx, client.streamCancelHandler())

	select {
	case <-called:
		t.Fatal("a cancel without a job id must not reach the handler")
	default:
	}
}
