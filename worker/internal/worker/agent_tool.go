package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	connectorpb "oasm-worker/internal/gen/connector"
	pb "oasm-worker/internal/gen/workers"
)

// toolResultSender streams one raw result event of an agent tool run to core.
type toolResultSender func(eventType pb.RemoteExecuteResultEventType, data []byte, exitCode int32) error

// agentToolMaxRun bounds a run whose manifest sets no timeout, so a wedged
// connector cannot hold a container forever.
const agentToolMaxRun = 15 * time.Minute

// runAgentTool runs one connector tool against one target for an AI agent.
// It is not a job: nothing goes to the job registry. Every result chunk is
// streamed back raw as STDOUT, then EXIT 0 on Done or ERROR on failure.
// It runs on the agent lane — no MaxConcurrency slot, refused at once when
// the node has no free CPU/RAM, since the agent is waiting on the call.
func runAgentTool(ctx context.Context, sessionID, ownerID string, run *pb.ToolRun, events chan<- TuiEvent, mgr *execution.Manager, proxy *connector.Proxy, send toolResultSender) {
	log := NewTuiLogger(events, "AgentTool")
	fail := func(msg string) {
		log.Warning("[%s] %s: %s", sessionID, run.GetTool(), msg)
		_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, []byte(msg), 0)
	}
	if mgr == nil || proxy == nil {
		fail("this worker cannot run connector tools (no container runtime)")
		return
	}
	if run.GetTool() == "" || run.GetImage() == "" || run.GetTarget() == "" {
		fail("tool, image and target are required")
		return
	}
	if ok, retryIn := imageBackoff.Allow(run.GetImage()); !ok {
		fail(fmt.Sprintf("image is backing off after a failure, retry in %s", retryIn.Round(time.Second)))
		return
	}

	spec := execution.JobSpec{
		Tool:   run.GetTool(),
		Image:  run.GetImage(),
		Inputs: map[string]any{"target": run.GetTarget()},
		// Container label/trace id only; there is no job behind it.
		JobID:    sessionID,
		WorkerID: ownerID,
		Lane:     execution.AgentLane,
	}
	if run.GetCpu() != "" || run.GetMemory() != "" {
		spec.Limits = map[string]any{
			execution.JobCPUKey:            run.GetCpu(),
			execution.JobMemoryKey:         run.GetMemory(),
			execution.JobTimeoutSecondsKey: int(run.GetTimeoutSeconds()),
		}
	}

	execID, err := mgr.Submit(ctx, spec)
	if errors.Is(err, execution.ErrPoolExhausted) {
		fail("worker out of capacity (cpu/mem)")
		return
	}
	if err != nil {
		imageBackoff.RecordFailure(spec.Image, err.Error())
		fail(fmt.Sprintf("submit failed: %v", err))
		return
	}

	resultCh := make(chan connector.ResultMsg, 16)
	proxy.Register(execID, resultCh)

	config := map[string]string{}
	if run.GetConfigJson() != "" {
		config["oasm_config"] = run.GetConfigJson()
	}
	if err := proxy.SendExecute(execID, &connectorpb.ExecuteJob{
		ExecutionId: execID,
		JobId:       sessionID,
		Tool:        spec.Tool,
		Image:       spec.Image,
		Inputs:      map[string]string{"target": run.GetTarget()},
		Config:      config,
	}); err != nil {
		fail(fmt.Sprintf("failed to send ExecuteJob: %v", err))
		releaseAgentExec(mgr, proxy, execID, false)
		return
	}
	log.Info("[%s] %s started on %s (exec=%s)", sessionID, spec.Tool, run.GetTarget(), execID)

	maxRun := agentToolMaxRun
	if secs := run.GetTimeoutSeconds(); secs > 0 {
		maxRun = time.Duration(secs)*time.Second + execution.ConnectorConnectTimeout
	}
	drainAgentTool(ctx, sessionID, execID, spec.Image, maxRun, execution.ConnectorConnectTimeout, mgr, proxy, resultCh, send, log)
}

// drainAgentTool streams the connector's results raw until Done/disconnect,
// a missed connect, the run deadline or the session end, then frees the
// container.
func drainAgentTool(ctx context.Context, sessionID, execID, image string, maxRun, connectTimeout time.Duration, mgr *execution.Manager, proxy *connector.Proxy, resultCh <-chan connector.ResultMsg, send toolResultSender, log *TuiLogger) {
	fail := func(msg string) {
		log.Warning("[%s] %s", sessionID, msg)
		_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, []byte(msg), 0)
	}
	deadline := time.NewTimer(maxRun)
	defer deadline.Stop()
	connect := time.NewTimer(connectTimeout)
	defer connect.Stop()
	connectC := (<-chan time.Time)(connect.C)
	regCh := proxy.WaitRegistered(execID)

	for {
		select {
		case msg, ok := <-resultCh:
			if !ok {
				finishAgentTool(execID, image, proxy, send, log, sessionID)
				releaseAgentExec(mgr, proxy, execID, false)
				return
			}
			if len(msg.Data) > 0 {
				_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDOUT, msg.Data, 0)
			}
			if len(msg.Findings) > 0 {
				if b, err := json.Marshal(msg.Findings); err == nil {
					_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDOUT, append(b, '\n'), 0)
				}
			}
		case <-regCh:
			connect.Stop()
			connectC, regCh = nil, nil
		case <-connectC:
			imageBackoff.RecordFailure(image, "connector did not connect")
			fail(fmt.Sprintf("connector did not connect within %s", connectTimeout))
			releaseAgentExec(mgr, proxy, execID, true)
			return
		case <-deadline.C:
			fail(fmt.Sprintf("tool run exceeded %s", maxRun))
			releaseAgentExec(mgr, proxy, execID, true)
			return
		case <-ctx.Done():
			fail("worker session ended")
			releaseAgentExec(mgr, proxy, execID, true)
			return
		}
	}
}

func finishAgentTool(execID, image string, proxy *connector.Proxy, send toolResultSender, log *TuiLogger, sessionID string) {
	errMsg, hasError := proxy.PopError(execID)
	hadDone := proxy.PopDone(execID)
	switch {
	case hasError && errMsg != "":
		// The connector ran and reported a target-side failure: not an image defect.
		imageBackoff.RecordSuccess(image)
		_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, []byte(errMsg), 0)
	case !hadDone:
		imageBackoff.RecordFailure(image, "connector disconnected before Done")
		_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, []byte("connector disconnected before Done"), 0)
	default:
		imageBackoff.RecordSuccess(image)
		_ = send(pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_EXIT, nil, 0)
	}
	log.Info("[%s] tool run finished: exec=%s error=%q", sessionID, execID, errMsg)
}

// releaseAgentExec frees the execution on a detached context; cancel kills a
// run that did not finish, otherwise a pooled container goes back idle.
func releaseAgentExec(mgr *execution.Manager, proxy *connector.Proxy, execID string, cancel bool) {
	proxy.Unregister(execID)
	if mgr != nil {
		cleanupCtx, done := newDetachedCleanupContext()
		if cancel {
			_ = mgr.Cancel(cleanupCtx, execID)
		}
		_ = mgr.Release(cleanupCtx, execID)
		done()
	}
	proxy.OnConnectorDown(execID)
}
