package grpcclient

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/metadata"
	workers "oasm-worker/internal/gen/workers"
)

type staticTelemetryProvider struct {
	instanceID string
}

func (p staticTelemetryProvider) Snapshot(context.Context) (*workers.WorkerTelemetryRequest, error) {
	return &workers.WorkerTelemetryRequest{
		SchemaVersion: 1,
		InstanceId:    p.instanceID,
	}, nil
}

func TestReportTelemetryAuthenticatesWithMetadataAndSequences(t *testing.T) {
	srv := newTestServer(t)
	srv.workersSrv.joinFn = func(context.Context, *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "worker-1", WorkerToken: "token-1"}, nil
	}
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatal(err)
	}
	srv.client.SetTelemetryProvider(staticTelemetryProvider{instanceID: "instance-1"})

	for expected := uint64(1); expected <= 2; expected++ {
		var gotSequence uint64
		var gotToken string
		srv.workersSrv.telemetryFn = func(ctx context.Context, req *workers.WorkerTelemetryRequest) (*workers.WorkerTelemetryResponse, error) {
			gotSequence = req.GetSequence()
			md, _ := metadata.FromIncomingContext(ctx)
			gotToken = firstMetadata(md, workerTokenHeader)
			return &workers.WorkerTelemetryResponse{AcceptedSequence: gotSequence, NextReportAfterMs: 10_000}, nil
		}

		if _, err := srv.client.ReportTelemetry(context.Background()); err != nil {
			t.Fatal(err)
		}
		if gotSequence != expected {
			t.Fatalf("expected sequence %d, got %d", expected, gotSequence)
		}
		if gotToken != "token-1" {
			t.Fatalf("expected worker token metadata, got %q", gotToken)
		}
	}
}

func TestConnectStartsTelemetryAfterJoinWithoutChangingReady(t *testing.T) {
	srv := newTestServer(t)
	joinCalled := make(chan struct{}, 1)
	srv.workersSrv.joinFn = func(context.Context, *workers.JoinRequest) (*workers.JoinResponse, error) {
		select {
		case joinCalled <- struct{}{}:
		default:
		}
		return &workers.JoinResponse{WorkerId: "worker-1", WorkerToken: "token-1"}, nil
	}
	aliveStarted := make(chan struct{})
	srv.workersSrv.aliveFn = func(_ *workers.AliveRequest, stream workers.WorkersService_AliveServer) error {
		close(aliveStarted)
		<-stream.Context().Done()
		return stream.Context().Err()
	}
	telemetryCalled := make(chan *workers.WorkerTelemetryRequest, 1)
	srv.workersSrv.telemetryFn = func(_ context.Context, req *workers.WorkerTelemetryRequest) (*workers.WorkerTelemetryResponse, error) {
		telemetryCalled <- req
		return &workers.WorkerTelemetryResponse{AcceptedSequence: req.GetSequence(), NextReportAfterMs: 10_000}, nil
	}
	srv.client.SetTelemetryProvider(staticTelemetryProvider{instanceID: "instance-1"})
	srv.client.reconnectDelay = time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan bool, 4)
	go srv.client.Connect(ctx, ready)
	<-joinCalled
	<-aliveStarted
	if first := <-ready; !first {
		t.Fatal("expected first ready signal to remain true")
	}
	select {
	case request := <-telemetryCalled:
		if request.GetInstanceId() != "instance-1" || request.GetSequence() != 1 {
			t.Fatalf("unexpected telemetry request: %#v", request)
		}
	case <-time.After(time.Second):
		t.Fatal("telemetry was not sent immediately after Join")
	}
	select {
	case readyAgain := <-ready:
		t.Fatalf("telemetry unexpectedly changed ready state: %v", readyAgain)
	case <-time.After(20 * time.Millisecond):
	}
	cancel()
}

func TestTelemetryRetryDelayAddsBoundedJitter(t *testing.T) {
	delay := 10 * time.Second
	for range 100 {
		got := telemetryRetryDelay(delay)
		if got < 8*time.Second || got > 12*time.Second {
			t.Fatalf("jittered delay %v outside [8s, 12s]", got)
		}
	}
}

func firstMetadata(md metadata.MD, key string) string {
	values := md.Get(key)
	if len(values) == 0 {
		return ""
	}
	return values[0]
}
