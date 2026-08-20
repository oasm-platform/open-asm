package grpcclient

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	workers "oasm-worker/internal/gen/workers"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestJoin_StoresWorkerIDAndToken(t *testing.T) {
	// Given: a test server whose Join returns a worker ID and token
	srv := newTestServer(t)
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}

	// When: Join is called
	err := srv.client.Join(context.Background())

	// Then: no error, worker ID stored, auth token set
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := srv.client.WorkerID(); got != "w-1" {
		t.Errorf("expected worker ID w-1, got %q", got)
	}
	md, err := srv.client.auth.GetRequestMetadata(context.Background())
	if err != nil {
		t.Fatalf("unexpected metadata error: %v", err)
	}
	if got := md[workerTokenHeader]; got != "tok-1" {
		t.Errorf("expected token tok-1 in metadata, got %q", got)
	}
}

func TestJoin_SendsAPIKeyAndMetadata(t *testing.T) {
	// Given: a test server that records the join request
	srv := newTestServer(t)
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}

	// When: Join is called
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: the recorded request carries the api key and non-nil metadata
	srv.workersSrv.mu.Lock()
	defer srv.workersSrv.mu.Unlock()
	if len(srv.workersSrv.joinCalls) != 1 {
		t.Fatalf("expected 1 join call, got %d", len(srv.workersSrv.joinCalls))
	}
	call := srv.workersSrv.joinCalls[0]
	if call.apiKey != "test-api-key" {
		t.Errorf("expected api key test-api-key, got %q", call.apiKey)
	}
	if call.metadata == nil {
		t.Fatal("expected non-nil metadata")
	}
	if call.metadata.Name == nil || *call.metadata.Name == "" {
		t.Error("expected metadata name to be set")
	}
	if call.metadata.Os == nil || *call.metadata.Os == "" {
		t.Error("expected metadata os to be set")
	}
}

func TestConnect_FailingJoin_RetriesAndEmitsFalse(t *testing.T) {
	// Given: a server whose Join always fails, and short backoff delays
	srv := newTestServer(t)
	var joinCount atomic.Int32
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		joinCount.Add(1)
		return nil, status.Error(codes.Unavailable, "server down")
	}
	srv.client.connectBaseDelay = 10 * time.Millisecond
	srv.client.connectMaxDelay = 50 * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	ready := make(chan bool, 10)

	// When: Connect runs until the context expires
	go srv.client.Connect(ctx, ready)

	// Then: it emits false signals and retries Join repeatedly
	var falses int
	timeout := time.After(500 * time.Millisecond)
collect:
	for {
		select {
		case v := <-ready:
			if !v {
				falses++
			}
		case <-timeout:
			break collect
		}
	}
	if falses < 2 {
		t.Errorf("expected at least 2 false signals, got %d", falses)
	}
	if joinCount.Load() < 2 {
		t.Errorf("expected at least 2 join attempts, got %d", joinCount.Load())
	}
}

func TestConnect_SuccessfulJoin_EmitsTrue_ThenAliveDrop_Reconnects(t *testing.T) {
	// Given: a server that joins successfully and closes the alive stream after one heartbeat
	srv := newTestServer(t)
	var joinCount atomic.Int32
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		n := joinCount.Add(1)
		id := fmt.Sprintf("w-%d", n)
		return &workers.JoinResponse{WorkerId: id, WorkerToken: "tok-" + id}, nil
	}
	srv.workersSrv.aliveFn = func(req *workers.AliveRequest, srv workers.WorkersService_AliveServer) error {
		return srv.Send(&workers.AliveResponse{
			WorkerId:   "w-1",
			Alive:      true,
			LastSeenAt: time.Now().Format(time.RFC3339),
		})
	}
	srv.client.connectBaseDelay = 10 * time.Millisecond
	srv.client.connectMaxDelay = 20 * time.Millisecond
	srv.client.reconnectDelay = 5 * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	ready := make(chan bool, 100)

	// When: Connect runs
	go srv.client.Connect(ctx, ready)

	// Then: it emits true, then false (alive drop), then true (re-join)
	var signals []bool
	deadline := time.After(1 * time.Second)
	for len(signals) < 3 {
		select {
		case v := <-ready:
			signals = append(signals, v)
		case <-deadline:
			goto done
		}
	}
done:
	if len(signals) < 3 {
		t.Fatalf("expected at least 3 signals (true, false, true), got %v", signals)
	}
	if signals[0] != true || signals[1] != false || signals[2] != true {
		t.Errorf("expected [true, false, true], got %v", signals)
	}
}

func TestConnect_ContextCancelled_StopsLoop(t *testing.T) {
	// Given: a server that joins successfully and blocks the alive stream until cancelled
	srv := newTestServer(t)
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}
	srv.workersSrv.aliveFn = func(req *workers.AliveRequest, srv workers.WorkersService_AliveServer) error {
		<-srv.Context().Done()
		return srv.Context().Err()
	}
	srv.client.connectBaseDelay = 10 * time.Millisecond
	srv.client.reconnectDelay = 5 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan bool, 100)

	done := make(chan struct{})
	go func() {
		srv.client.Connect(ctx, ready)
		close(done)
	}()

	// When: Connect becomes ready, then the context is cancelled
	select {
	case v := <-ready:
		if !v {
			t.Fatal("expected ready=true before cancel")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Connect did not become ready")
	}
	cancel()

	// Then: Connect returns promptly
	select {
	case <-done:
		// Connect returned after cancel — good
	case <-time.After(2 * time.Second):
		t.Fatal("Connect did not return after context cancel")
	}
}
