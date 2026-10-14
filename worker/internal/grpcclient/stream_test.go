package grpcclient

import (
	"context"
	"net"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/test/bufconn"
	workers "oasm-worker/internal/gen/workers"
)

// streamTestService is the WorkersService fake plus a controllable Connect, the
// bidirectional stream core-api uses to push job cancellations. Connect is a
// method of WorkersService, so it has to be overridden on the service itself
// rather than registered as a second service.
type streamTestService struct {
	*fakeWorkersService
	handleConnect func(grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker]) error
	connects      atomic.Int32
}

func (s *streamTestService) Connect(
	srv grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker],
) error {
	s.connects.Add(1)
	if s.handleConnect == nil {
		<-srv.Context().Done()
		return srv.Context().Err()
	}
	return s.handleConnect(srv)
}

// newStreamTestClient wires a client to a WorkersService whose Connect is driven
// by handleConnect, and returns the service so tests can count Connect calls.
func newStreamTestClient(
	t *testing.T,
	handleConnect func(grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker]) error,
) (*Client, *streamTestService) {
	t.Helper()
	lis := bufconn.Listen(64 * 1024)
	grpcSrv := grpc.NewServer()
	svc := &streamTestService{
		fakeWorkersService: &fakeWorkersService{},
		handleConnect:      handleConnect,
	}
	workers.RegisterWorkersServiceServer(grpcSrv, svc)
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
	return client, svc
}

// acceptingConnect answers the register handshake, then lets the test push
// frames before holding the stream open.
func acceptingConnect(
	t *testing.T,
	accepted bool,
	push func(grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker]) error,
) func(grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker]) error {
	t.Helper()
	return func(srv grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker]) error {
		if _, err := srv.Recv(); err != nil {
			return err
		}
		if err := srv.Send(&workers.CoreToWorker{
			Payload: &workers.CoreToWorker_RegisterResp{
				RegisterResp: &workers.RegisterResponse{
					WorkerId:            "worker-1",
					Accepted:            accepted,
					Reason:              "bad token",
					HeartbeatIntervalMs: 1000,
				},
			},
		}); err != nil {
			return err
		}
		if push != nil {
			if err := push(srv); err != nil {
				return err
			}
		}
		// Stay open so the client reliably processes what we sent.
		<-srv.Context().Done()
		return srv.Context().Err()
	}
}

func TestRunWorkerStream_DeliversCancelToHandler(t *testing.T) {
	registered := make(chan struct{})
	client, _ := newStreamTestClient(t, acceptingConnect(t, true, func(
		srv grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker],
	) error {
		select {
		case <-registered:
		default:
			close(registered)
		}
		return srv.Send(&workers.CoreToWorker{
			Payload: &workers.CoreToWorker_Cancel{
				Cancel: &workers.CancelRequest{JobId: "job-1", Reason: "cancelled by user"},
			},
		})
	}))

	received := make(chan string, 4)
	client.SetStreamCancelHandler(func(jobID, reason string) {
		received <- jobID + "|" + reason
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go func() { _ = client.RunWorkerStream(ctx, client.streamCancelHandler()) }()

	select {
	case <-registered:
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
	client, _ := newStreamTestClient(t, acceptingConnect(t, false, nil))

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
	client, _ := newStreamTestClient(t, acceptingConnect(t, true, func(
		srv grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker],
	) error {
		return srv.Send(&workers.CoreToWorker{
			Payload: &workers.CoreToWorker_Cancel{
				Cancel: &workers.CancelRequest{Reason: "no job id"},
			},
		})
	}))

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
