package grpcclient

import (
	"context"
	"testing"

	"google.golang.org/grpc/metadata"

	workers "oasm-worker/internal/gen/workers"
)

// subscribeHeader opens RemoteExecuteSubscribe and returns the values of the
// x-agent-sandbox header core-api received.
func subscribeHeader(t *testing.T, sandbox bool) []string {
	t.Helper()
	return subscribeMetadata(t, sandbox).Get(AgentSandboxHeader)
}

// subscribeMetadata opens RemoteExecuteSubscribe and returns the metadata
// core-api received.
func subscribeMetadata(t *testing.T, sandbox bool) metadata.MD {
	t.Helper()
	srv := newTestServer(t)
	got := make(chan metadata.MD, 1)
	srv.workersSrv.subscribeFn = func(_ *workers.RemoteExecuteSubscribeRequest, s workers.WorkersService_RemoteExecuteSubscribeServer) error {
		md, _ := metadata.FromIncomingContext(s.Context())
		got <- md
		return s.Send(&workers.RemoteExecuteSubscribeResponse{
			Type: workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTED,
		})
	}
	srv.client.SetAgentSandbox(sandbox)

	h, err := srv.client.RemoteExecuteSubscribe(context.Background())
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	if _, err := h.Next(context.Background()); err != nil {
		t.Fatalf("next: %v", err)
	}
	return <-got
}

// Core lets a global worker serve every workspace's agents only on this
// header, so it must be sent exactly when the sandbox is in use.
func TestRemoteExecuteSubscribe_SendsSandboxHeaderWhenEnabled(t *testing.T) {
	if v := subscribeHeader(t, true); len(v) != 1 || v[0] != "1" {
		t.Fatalf("x-agent-sandbox = %v, want [1]", v)
	}
}

func TestRemoteExecuteSubscribe_NoSandboxHeaderByDefault(t *testing.T) {
	if v := subscribeHeader(t, false); len(v) != 0 {
		t.Fatalf("x-agent-sandbox must be absent without a sandbox, got %v", v)
	}
}

// Core only sends PING events to workers that advertise they understand them.
func TestRemoteExecuteSubscribe_AlwaysAdvertisesKeepalive(t *testing.T) {
	for _, sandbox := range []bool{true, false} {
		if v := subscribeMetadata(t, sandbox).Get(RemoteExecuteKeepaliveHeader); len(v) != 1 || v[0] != "1" {
			t.Fatalf("sandbox=%v: x-remote-execute-keepalive = %v, want [1]", sandbox, v)
		}
	}
}
