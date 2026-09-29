package grpcclient

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc"
	workers "oasm-worker/internal/gen/workers"
)

// Connect survives many alive-stream drops (core-api restarts, network blips).
// Each cycle must NOT start another stream loop: the previous one would keep
// reconnecting, and the resulting streams would evict each other from the
// server's registry — churn that silently drops job cancels.
func TestConnect_OpensSingleWorkerStreamAcrossReconnects(t *testing.T) {
	client, svc := newStreamTestClient(t, func(
		srv grpc.BidiStreamingServer[workers.WorkerToCore, workers.CoreToWorker],
	) error {
		// Answer the handshake, then hold the stream until the peer goes away.
		if _, err := srv.Recv(); err != nil {
			return err
		}
		if err := srv.Send(&workers.CoreToWorker{
			Payload: &workers.CoreToWorker_RegisterResp{
				RegisterResp: &workers.RegisterResponse{WorkerId: "worker-1", Accepted: true},
			},
		}); err != nil {
			return err
		}
		<-srv.Context().Done()
		return srv.Context().Err()
	})

	// Join must succeed (Connect() joins before reporting ready) and Alive must
	// return immediately so the join/alive loop keeps reconnecting.
	svc.joinFn = func(context.Context, *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "worker-1", WorkerToken: "tok-1"}, nil
	}
	svc.aliveFn = func(*workers.AliveRequest, workers.WorkersService_AliveServer) error {
		return context.Canceled // any error makes Connect reconnect
	}
	client.reconnectDelay = 5 * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	ready := make(chan bool, 64)
	go client.Connect(ctx, ready)

	// Let several join/alive cycles happen.
	joins := 0
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) && joins < 5 {
		select {
		case state := <-ready:
			if state {
				joins++
			}
		case <-time.After(5 * time.Millisecond):
		}
	}

	if joins < 5 {
		t.Fatalf("expected several reconnect cycles, saw %d", joins)
	}
	if got := svc.connects.Load(); got != 1 {
		t.Fatalf("server saw %d Connect streams across %d reconnects, want exactly 1", got, joins)
	}
}
