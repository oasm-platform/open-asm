package worker

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	connectorpb "oasm-worker/internal/gen/connector"
	pb "oasm-worker/internal/gen/workers"
)

type sentEvent struct {
	t    pb.RemoteExecuteResultEventType
	data string
}

type captureSender struct {
	mu     sync.Mutex
	events []sentEvent
}

func (c *captureSender) send(t pb.RemoteExecuteResultEventType, data []byte, _ int32) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, sentEvent{t, string(data)})
	return nil
}

func (c *captureSender) get() []sentEvent {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]sentEvent(nil), c.events...)
}

// A tool run that finds no free capacity is refused at once — the agent is
// waiting on the call — and reports nothing to the job registry.
func TestAgentToolFailsFastWhenPoolExhausted(t *testing.T) {
	oldBackoff := swapImageBackoff(execution.NewImageBackoff())
	t.Cleanup(func() { imageBackoff = oldBackoff })

	_, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0)
	pool := execution.NewPoolManager(0, 1, 0)
	pool.SetResourceBudget(1000, 1<<30)
	mgr.SetPool(pool)
	img := "ghcr.io/oasm-platform/connector-nmap:7.97"
	cpu, mem := "1000m", "512Mi"

	// Occupy the whole node budget.
	if _, err := mgr.Submit(context.Background(), execution.JobSpec{Tool: "nmap", Image: img, JobID: "occupier", Lane: execution.AgentLane, Limits: map[string]any{"cpu": cpu, "memory": mem}}); err != nil {
		t.Fatalf("occupier: %v", err)
	}

	sender := &captureSender{}
	start := time.Now()
	runAgentTool(context.Background(), "sess-1", "owner", &pb.ToolRun{Tool: "nmap", Image: img, Target: "example.com", Cpu: &cpu, Memory: &mem},
		make(chan TuiEvent, 64), mgr, connector.NewProxy(), sender.send)

	if waited := time.Since(start); waited > 2*time.Second {
		t.Fatalf("tool run waited %s for a pool slot; it must fail fast", waited)
	}
	got := sender.get()
	if len(got) != 1 || got[0].t != pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR || !strings.Contains(got[0].data, "worker out of capacity") {
		t.Fatalf("expected one capacity error, got %+v", got)
	}
	if r := jobsSrv.getResults(); len(r) != 0 {
		t.Fatalf("tool run must not report to the job registry, got %+v", r)
	}
}

// Results stream back raw, in order, and Done ends the run with EXIT.
func TestAgentToolStreamsRawResultsThenExit(t *testing.T) {
	oldBackoff := swapImageBackoff(execution.NewImageBackoff())
	t.Cleanup(func() { imageBackoff = oldBackoff })

	proxy := connector.NewProxy()
	execID := "exec-tool-1"
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)
	sender := &captureSender{}

	done := make(chan struct{})
	go func() {
		drainAgentTool(context.Background(), "sess-2", execID, "img", time.Minute, time.Minute, nil, proxy, resultCh, sender.send, NewTuiLogger(make(chan TuiEvent, 64), "t"))
		close(done)
	}()

	proxy.ForwardResult(execID, []byte("raw line\n"), nil)
	proxy.ForwardResult(execID, nil, []*connectorpb.Finding{{Name: "open port"}})
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("drain did not finish after Done")
	}
	got := sender.get()
	if len(got) != 3 ||
		got[0] != (sentEvent{pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDOUT, "raw line\n"}) ||
		got[1].t != pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_STDOUT || !strings.Contains(got[1].data, "open port") ||
		got[2].t != pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_EXIT {
		t.Fatalf("unexpected events %+v", got)
	}
}

// A connector Done carrying an error ends the run with ERROR.
func TestAgentToolConnectorErrorIsReported(t *testing.T) {
	oldBackoff := swapImageBackoff(execution.NewImageBackoff())
	t.Cleanup(func() { imageBackoff = oldBackoff })

	proxy := connector.NewProxy()
	execID := "exec-tool-2"
	resultCh := make(chan connector.ResultMsg, 4)
	proxy.Register(execID, resultCh)
	sender := &captureSender{}

	done := make(chan struct{})
	go func() {
		drainAgentTool(context.Background(), "sess-3", execID, "img", time.Minute, time.Minute, nil, proxy, resultCh, sender.send, NewTuiLogger(make(chan TuiEvent, 64), "t"))
		close(done)
	}()
	proxy.SetError(execID, "target unreachable")
	proxy.MarkDone(execID)
	proxy.OnConnectorDown(execID)
	<-done

	got := sender.get()
	if len(got) != 1 || got[0] != (sentEvent{pb.RemoteExecuteResultEventType_REMOTE_EXECUTE_RESULT_ERROR, "target unreachable"}) {
		t.Fatalf("unexpected events %+v", got)
	}
}
