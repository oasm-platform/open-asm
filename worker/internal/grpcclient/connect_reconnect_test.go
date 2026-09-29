package grpcclient

import (
	"context"
	"io"
	"net"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/test/bufconn"
	stream "oasm-worker/internal/gen/worker_stream"
	workers "oasm-worker/internal/gen/workers"
)

// countingStreamServer records how many Connect calls the server saw, so a
// reconnect storm can be detected: the worker must keep exactly ONE
// bidirectional stream open for the life of the process, not one per
// join/alive cycle.
type countingStreamServer struct {
	stream.UnimplementedWorkerStreamServiceServer
	connects atomic.Int32
}

func (s *countingStreamServer) Connect(
	srv grpc.BidiStreamingServer[stream.WorkerToCore, stream.CoreToWorker],
) error {
	s.connects.Add(1)
	// Answer the handshake, then hold the stream open until the peer goes away.
	if _, err := srv.Recv(); err != nil {
		return err
	}
	if err := srv.Send(&stream.CoreToWorker{
		Payload: &stream.CoreToWorker_RegisterResp{
			RegisterResp: &stream.RegisterResponse{WorkerId: "worker-1", Accepted: true},
		},
	}); err != nil {
		return err
	}
	<-srv.Context().Done()
	return srv.Context().Err()
}

// newReconnectTestClient wires a client against a workers service whose Alive
// stream ends immediately (so Connect keeps reconnecting) plus a counting
// worker-stream service.
func newReconnectTestClient(t *testing.T) (*Client, *countingStreamServer) {
	t.Helper()
	lis := bufconn.Listen(64 * 1024)
	grpcSrv := grpc.NewServer()
	workersSrv := &fakeWorkersService{}
	workersSrv.joinFn = func(context.Context, *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "worker-1", WorkerToken: "tok-1"}, nil
	}
	// Alive returns io.EOF straight away, so the worker's join/alive loop
	// reconnects immediately — the exact production trigger (core-api restart).
	workersSrv.aliveFn = func(*workers.AliveRequest, workers.WorkersService_AliveServer) error {
		return io.EOF
	}
	workers.RegisterWorkersServiceServer(grpcSrv, workersSrv)
	streamSrv := &countingStreamServer{}
	stream.RegisterWorkerStreamServiceServer(grpcSrv, streamSrv)
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
	client.reconnectDelay = 5 * time.Millisecond
	t.Cleanup(func() {
		_ = client.Close()
		grpcSrv.Stop()
	})
	return client, streamSrv
}

// Connect survives many alive-stream drops (core-api restarts, network blips).
// Each cycle must NOT start another stream loop: the previous one would keep
// reconnecting, and the resulting streams would evict each other from the
// server's registry — churn that silently drops job cancels.
func TestConnect_OpensSingleWorkerStreamAcrossReconnects(t *testing.T) {
	client, streamSrv := newReconnectTestClient(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	ready := make(chan bool, 64)
	go client.Connect(ctx, ready)

	// Let several join/alive cycles happen.
	joins := 0
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case state := <-ready:
			if state {
				joins++
			}
		case <-time.After(5 * time.Millisecond):
		}
		if joins >= 5 {
			break
		}
	}

	if joins < 5 {
		t.Fatalf("expected several reconnect cycles, saw %d", joins)
	}
	if got := streamSrv.connects.Load(); got != 1 {
		t.Fatalf("server saw %d Connect streams across %d reconnects, want exactly 1", got, joins)
	}
}
