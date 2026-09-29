package grpcclient

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"time"

	stream "oasm-worker/internal/gen/worker_stream"
)

// StreamCancelFunc is invoked when core-api asks the worker to stop a job.
// jobID is the correlation core owns — the worker resolves it to its execution
// id internally. It runs on the stream's receive loop, so it must return
// promptly (heavy work belongs behind a goroutine).
type StreamCancelFunc func(jobID, reason string)

const (
	// streamHeartbeatInterval is the default liveness cadence; the server may
	// request a different one in its register response.
	streamHeartbeatInterval = 10 * time.Second
	// streamRegisterTimeout bounds the handshake, so a half-open stream (TCP up,
	// server never answers) is retried instead of held open forever.
	streamRegisterTimeout = 15 * time.Second
	// streamFrameBuffer decouples a burst of downstream frames from the send
	// path; a full buffer blocks the receive goroutine, which applies natural
	// backpressure to the server.
	streamFrameBuffer = 16
)

// RunWorkerStream opens the bidirectional worker↔core stream and blocks until it
// ends or ctx is done.
//
// It is purely additive: identity (Join), liveness (Alive), job pull (Next) and
// results keep their existing RPCs. The stream adds the missing push channel —
// core-api telling this worker to stop a job.
func (c *Client) RunWorkerStream(ctx context.Context, onCancel StreamCancelFunc) error {
	svc := stream.NewWorkerStreamServiceClient(c.conn)
	streamCtx, cancelStream := context.WithCancel(ctx)
	defer cancelStream()

	session, err := svc.Connect(streamCtx)
	if err != nil {
		return fmt.Errorf("open worker stream: %w", err)
	}

	// grpc-go allows one goroutine sending and one receiving; this function owns
	// every Send, the helper goroutine below owns every Recv.
	frames := make(chan *stream.CoreToWorker, streamFrameBuffer)
	recvDone := make(chan error, 1)
	go func() {
		for {
			frame, err := session.Recv()
			if err != nil {
				recvDone <- err
				return
			}
			select {
			case frames <- frame:
			case <-streamCtx.Done():
				return
			}
		}
	}()

	hostname, _ := os.Hostname()
	osName := runtime.GOOS
	mode := streamMapRunMode(c.runMode)
	version := "dev"
	token := c.auth.currentToken()

	if err := session.Send(&stream.WorkerToCore{
		Payload: &stream.WorkerToCore_Register{
			Register: &stream.RegisterRequest{
				ApiKey:    c.apiKey,
				Signature: c.signature,
				Token:     &token,
				Metadata:  &stream.WorkerMetadata{Name: &hostname, Os: &osName, Mode: &mode},
				Version:   &version,
			},
		},
	}); err != nil {
		return fmt.Errorf("send register: %w", err)
	}

	heartbeat := time.NewTicker(streamHeartbeatInterval)
	defer heartbeat.Stop()
	registerDeadline := time.NewTimer(streamRegisterTimeout)
	defer registerDeadline.Stop()
	var sequence uint64

	for {
		select {
		case <-streamCtx.Done():
			return streamCtx.Err()

		case err := <-recvDone:
			return fmt.Errorf("worker stream recv: %w", err)

		case <-registerDeadline.C:
			return fmt.Errorf("worker stream: register handshake timed out after %s", streamRegisterTimeout)

		case <-heartbeat.C:
			sequence++
			if err := session.Send(&stream.WorkerToCore{
				Payload: &stream.WorkerToCore_Heartbeat{
					Heartbeat: &stream.Heartbeat{
						WorkerId: c.WorkerID(),
						Sequence: sequence,
						AtMs:     time.Now().UnixMilli(),
					},
				},
			}); err != nil {
				return fmt.Errorf("send heartbeat: %w", err)
			}

		case frame := <-frames:
			switch payload := frame.GetPayload().(type) {
			case *stream.CoreToWorker_RegisterResp:
				resp := payload.RegisterResp
				if !resp.GetAccepted() {
					return fmt.Errorf("worker stream rejected: %s", resp.GetReason())
				}
				// Handshake done: the deadline only guards the open, never the
				// long-lived stream.
				if !registerDeadline.Stop() {
					select {
					case <-registerDeadline.C:
					default:
					}
				}
				if ms := resp.GetHeartbeatIntervalMs(); ms > 0 {
					heartbeat.Reset(time.Duration(ms) * time.Millisecond)
				}
				c.logger.Success(
					"worker stream registered (worker_id=%s)", resp.GetWorkerId(),
				)

			case *stream.CoreToWorker_HeartbeatAck:
				// Liveness acknowledgement; nothing to do.

			case *stream.CoreToWorker_Cancel:
				cancel := payload.Cancel
				if cancel.GetJobId() == "" {
					continue
				}
				c.logger.Info(
					"cancel received for job %s (reason=%s)",
					cancel.GetJobId(), cancel.GetReason(),
				)
				if onCancel != nil {
					onCancel(cancel.GetJobId(), cancel.GetReason())
				}
			}
		}
	}
}

// runWorkerStream keeps the bidirectional stream up for the life of ctx.
//
// It is deliberately independent of the Join/Alive loop: the stream is an
// additive push channel, so a core-api that does not serve it (or a stream that
// breaks) must never tear the worker down. A failed attempt is logged and
// retried with the same backoff the reconnect loop uses.
func (c *Client) runWorkerStream(ctx context.Context) {
	for ctx.Err() == nil {
		if err := c.RunWorkerStream(ctx, c.streamCancelHandler()); err != nil && ctx.Err() == nil {
			c.logger.Warning("worker stream ended: %v", err)
		}
		if !c.waitWithContext(ctx, c.reconnectDelay) {
			return
		}
	}
}

// streamMapRunMode converts the configured run mode to the proto enum.
func streamMapRunMode(mode string) stream.WorkerRunMode {
	switch mode {
	case "cli":
		return stream.WorkerRunMode_WORKER_RUN_MODE_CLI
	case "node":
		return stream.WorkerRunMode_WORKER_RUN_MODE_NODE
	default:
		return stream.WorkerRunMode_WORKER_RUN_MODE_UNKNOWN
	}
}
