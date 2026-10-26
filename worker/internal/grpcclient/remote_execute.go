package grpcclient

import (
	"context"
	"fmt"
	"io"

	"google.golang.org/grpc/metadata"

	workers "oasm-worker/internal/gen/workers"
)

// RemoteExecuteHandler wraps the RemoteExecuteSubscribe stream and the
// RemoteExecuteResult unary RPC, tracking the ids of the current command so
// results are attributed to the right session.
type RemoteExecuteHandler struct {
	stream    workers.WorkersService_RemoteExecuteSubscribeClient
	client    *Client
	id        string
	sessionID string
	workerID  string
}

// AgentSandboxHeader is the RemoteExecuteSubscribe metadata key telling
// core-api this worker runs agent shell commands inside a sandbox container.
// Core only lets a shared (global) worker serve agents when it is present.
const AgentSandboxHeader = "x-agent-sandbox"

// RemoteExecuteKeepaliveHeader tells core-api this worker understands PING
// events, so core keeps the otherwise idle stream alive through proxies.
const RemoteExecuteKeepaliveHeader = "x-remote-execute-keepalive"

// SetAgentSandbox records whether agent commands run sandboxed. Set it only
// once the sandbox is actually usable: the header is a security claim core
// relies on to route other workspaces' agents here.
func (c *Client) SetAgentSandbox(enabled bool) { c.agentSandbox.Store(enabled) }

// RemoteExecuteSubscribe opens the remote-execute event stream to core-api.
func (c *Client) RemoteExecuteSubscribe(ctx context.Context) (*RemoteExecuteHandler, error) {
	ctx = metadata.AppendToOutgoingContext(ctx, RemoteExecuteKeepaliveHeader, "1")
	if c.agentSandbox.Load() {
		ctx = metadata.AppendToOutgoingContext(ctx, AgentSandboxHeader, "1")
	}
	stream, err := c.workers.RemoteExecuteSubscribe(ctx, &workers.RemoteExecuteSubscribeRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe to remote execute: %w", err)
	}
	return &RemoteExecuteHandler{stream: stream, client: c}, nil
}

// Next blocks for the next event on the stream, updating the tracked ids only
// for COMMAND events so CONNECTED/PING messages do not overwrite the ids
// used by subsequent SendStdout/SendError. Returns (nil, nil) when the stream
// closes cleanly.
func (h *RemoteExecuteHandler) Next(ctx context.Context) (*workers.RemoteExecuteSubscribeResponse, error) {
	resp, err := h.stream.Recv()
	if err == io.EOF {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to receive remote execute event: %w", err)
	}
	// Only track ids for COMMAND events; other types (CONNECTED/PING) may
	// carry empty ids and would misattribute subsequent results.
	if resp != nil && resp.Type == workers.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND {
		h.sessionID = resp.SessionId
		h.id = resp.Id
		h.workerID = resp.WorkerId
	}
	return resp, nil
}

// SendResult sends one result event for the current command to core-api.
func (h *RemoteExecuteHandler) SendResult(ctx context.Context, eventType workers.RemoteExecuteResultEventType, data []byte, exitCode int32) error {
	req := &workers.RemoteExecuteResultStream{
		Id:        h.id,
		SessionId: h.sessionID,
		Type:      eventType,
		Data:      data,
		ExitCode:  exitCode,
	}
	resp, err := h.client.workers.RemoteExecuteResult(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to send remote execute result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the result: %s", resp.Message)
	}
	return nil
}

// SendStdout streams stdout bytes for the current command.
func (h *RemoteExecuteHandler) SendStdout(ctx context.Context, data []byte) error {
	return h.SendResult(ctx, workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDOUT, data, 0)
}

// SendStderr streams stderr bytes for the current command.
func (h *RemoteExecuteHandler) SendStderr(ctx context.Context, data []byte) error {
	return h.SendResult(ctx, workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDERR, data, 0)
}

// SendExit reports the exit code of the current command.
func (h *RemoteExecuteHandler) SendExit(ctx context.Context, exitCode int32) error {
	return h.SendResult(ctx, workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_EXIT, nil, exitCode)
}

// SendError reports a fatal error for the current command.
func (h *RemoteExecuteHandler) SendError(ctx context.Context, errMsg string) error {
	return h.SendResult(ctx, workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, []byte(errMsg), 0)
}

// SendResultFor sends one result event attributed to a specific session/id.
// Concurrent runs must use it: SendResult reads ids that Next overwrites.
func (h *RemoteExecuteHandler) SendResultFor(ctx context.Context, sessionID, id string, eventType workers.RemoteExecuteResultEventType, data []byte, exitCode int32) error {
	req := &workers.RemoteExecuteResultStream{
		Id:        id,
		SessionId: sessionID,
		Type:      eventType,
		Data:      data,
		ExitCode:  exitCode,
	}
	resp, err := h.client.workers.RemoteExecuteResult(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to send remote execute result: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("server rejected the result: %s", resp.Message)
	}
	return nil
}

// SendErrorFor sends an error attributed to a specific session/id, avoiding
// misattribution when SendError is called concurrently with Next updates.
func (h *RemoteExecuteHandler) SendErrorFor(ctx context.Context, sessionID, id, workerID, errMsg string) error {
	_ = workerID
	return h.SendResultFor(ctx, sessionID, id, workers.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, []byte(errMsg), 0)
}

// ID returns the id of the most recently received event.
func (h *RemoteExecuteHandler) ID() string { return h.id }

// SessionID returns the session id of the most recently received event.
func (h *RemoteExecuteHandler) SessionID() string { return h.sessionID }

// WorkerID returns the worker id of the most recently received event.
func (h *RemoteExecuteHandler) WorkerID() string { return h.workerID }
