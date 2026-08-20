package grpcclient

import (
	"context"
	"strings"
	"testing"

	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

func TestRemoteExecuteSubscribe(t *testing.T) {
	// Given: a server that sends a CONNECTED event on subscribe
	srv := newTestServer(t)
	srv.workersSrv.subscribeFn = func(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error {
		return srv.Send(&workers.RemoteExecuteSubscribeResponse{
			Id:        "cmd-1",
			WorkerId:  "w-1",
			SessionId: "sess-1",
			Type:      workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTED,
		})
	}

	// When: subscribing and reading the first event
	h, err := srv.client.RemoteExecuteSubscribe(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event, err := h.Next(context.Background())

	// Then: the CONNECTED event is received but ids are not tracked (only COMMAND tracks)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if event == nil {
		t.Fatal("expected an event, got nil")
	}
	if event.Type != workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTED {
		t.Errorf("expected CONNECTED event, got %v", event.Type)
	}
	if h.ID() != "" || h.SessionID() != "" || h.WorkerID() != "" {
		t.Errorf("CONNECTED should not track ids: id=%q session=%q worker=%q", h.ID(), h.SessionID(), h.WorkerID())
	}
}

func TestRemoteExecuteHandler_NextReturnsNilNilOnEOF(t *testing.T) {
	// Given: a server that closes the subscribe stream immediately (EOF)
	srv := newTestServer(t)
	srv.workersSrv.subscribeFn = func(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error {
		return nil
	}

	h, err := srv.client.RemoteExecuteSubscribe(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// When: reading from the closed stream
	event, err := h.Next(context.Background())

	// Then: (nil, nil) — clean EOF, not an error
	if event != nil || err != nil {
		t.Errorf("expected (nil, nil) on EOF, got (%v, %v)", event, err)
	}
}

func TestRemoteExecuteHandler_SendStdout(t *testing.T) {
	// Given: a subscribed handler that received a COMMAND event, and a server that records result streams
	srv := newTestServer(t)
	srv.workersSrv.subscribeFn = func(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error {
		return srv.Send(&workers.RemoteExecuteSubscribeResponse{
			Id:        "cmd-1",
			WorkerId:  "w-1",
			SessionId: "sess-1",
			Type:      workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND,
			Command:   "echo hi",
		})
	}
	var got *workers.RemoteExecuteResultStream
	srv.workersSrv.resultStreamFn = func(ctx context.Context, req *workers.RemoteExecuteResultStream) (*workers.RemoteExecuteResultAck, error) {
		got = req
		return &workers.RemoteExecuteResultAck{Success: true}, nil
	}

	h, err := srv.client.RemoteExecuteSubscribe(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := h.Next(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// When: sending stdout
	if err := h.SendStdout(context.Background(), []byte("hello world")); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: the result stream carries type STDOUT, the data, the tracked ids, and exit code 0
	if got == nil {
		t.Fatal("expected a result stream to be received")
	}
	if got.Type != workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDOUT {
		t.Errorf("expected STDOUT type, got %v", got.Type)
	}
	if string(got.Data) != "hello world" {
		t.Errorf("expected data %q, got %q", "hello world", string(got.Data))
	}
	if got.Id != "cmd-1" || got.SessionId != "sess-1" {
		t.Errorf("expected id cmd-1/session sess-1, got %q/%q", got.Id, got.SessionId)
	}
	if got.ExitCode != 0 {
		t.Errorf("expected exit code 0, got %d", got.ExitCode)
	}
}

func TestRemoteExecuteHandler_SendError(t *testing.T) {
	// Given: a subscribed handler that received a COMMAND event, and a server that records result streams
	srv := newTestServer(t)
	srv.workersSrv.subscribeFn = func(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error {
		return srv.Send(&workers.RemoteExecuteSubscribeResponse{
			Id:        "cmd-1",
			WorkerId:  "w-1",
			SessionId: "sess-1",
			Type:      workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND,
		})
	}
	var got *workers.RemoteExecuteResultStream
	srv.workersSrv.resultStreamFn = func(ctx context.Context, req *workers.RemoteExecuteResultStream) (*workers.RemoteExecuteResultAck, error) {
		got = req
		return &workers.RemoteExecuteResultAck{Success: true}, nil
	}

	h, err := srv.client.RemoteExecuteSubscribe(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := h.Next(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// When: sending an error
	if err := h.SendError(context.Background(), "command exploded"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: the result stream carries type ERROR and the message bytes
	if got == nil {
		t.Fatal("expected a result stream to be received")
	}
	if got.Type != workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR {
		t.Errorf("expected ERROR type, got %v", got.Type)
	}
	if string(got.Data) != "command exploded" {
		t.Errorf("expected data %q, got %q", "command exploded", string(got.Data))
	}
}

func TestRemoteExecuteHandler_ServerRejects(t *testing.T) {
	// Given: a subscribed handler and a server that rejects result streams
	srv := newTestServer(t)
	srv.workersSrv.subscribeFn = func(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error {
		return srv.Send(&workers.RemoteExecuteSubscribeResponse{
			Id:        "cmd-1",
			WorkerId:  "w-1",
			SessionId: "sess-1",
			Type:      workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND,
		})
	}
	srv.workersSrv.resultStreamFn = func(ctx context.Context, req *workers.RemoteExecuteResultStream) (*workers.RemoteExecuteResultAck, error) {
		return &workers.RemoteExecuteResultAck{Success: false, Message: "unknown session"}, nil
	}

	h, err := srv.client.RemoteExecuteSubscribe(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := h.Next(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// When: sending a result that the server rejects
	err = h.SendStdout(context.Background(), []byte("data"))

	// Then: an error naming the rejection and carrying the server message is returned
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), "rejected") {
		t.Errorf("expected error containing %q, got %q", "rejected", err.Error())
	}
	if !strings.Contains(err.Error(), "unknown session") {
		t.Errorf("expected error to carry the server message, got %q", err.Error())
	}
}
