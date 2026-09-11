package connector

import (
	"strings"
	"testing"
)

// Phase 2 warm-pool reuse: a container survives its execution and the NEXT
// execution binds to the SAME stream. The proxy must route both ExecuteJobs
// to one stream and reject a second Register while the stream is live.

func TestBindExecRoutesSecondExecuteToSameStream(t *testing.T) {
	p := NewProxy()
	// Reuse path: the FIRST execution creates the container — bind before the
	// stream is live. The SECOND execution acquires the same container AFTER
	// its previous stream registered — bind while the stream is live.
	p.BindExec("exec-1", "c1")

	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	p.BindExec("exec-2", "c1")

	job1 := sampleExecuteJob()
	job2 := sampleExecuteJob()
	job2.ExecutionId = "exec-2"
	job2.JobId = "job-2"
	if err := p.SendExecute("exec-1", job1); err != nil {
		t.Fatalf("SendExecute exec-1: %v", err)
	}
	if err := p.SendExecute("exec-2", job2); err != nil {
		t.Fatalf("SendExecute exec-2: %v", err)
	}

	jobs := stream.sentExecutes()
	if len(jobs) != 2 {
		t.Fatalf("expected 2 ExecuteJobs on the shared stream, got %d", len(jobs))
	}
	if jobs[0].GetExecutionId() != "exec-1" || jobs[1].GetExecutionId() != "exec-2" {
		t.Fatalf("execution order wrong: %s then %s", jobs[0].GetExecutionId(), jobs[1].GetExecutionId())
	}

	// exec-2 was bound while the stream was already live: its registration
	// signal must be pre-closed so the drain skips the connect timer.
	select {
	case <-p.WaitRegistered("exec-2"):
	default:
		t.Fatal("WaitRegistered(exec-2) must be already closed (stream live at bind time)")
	}
}

func TestRegisterConnectorRejectsDuplicateStream(t *testing.T) {
	p := NewProxy()
	streamA := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", streamA); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	// Same container re-registering while its stream is live: reconnect must
	// be rejected, not silently replacing the live stream.
	streamB := &fakeConnectStream{}
	err := p.RegisterConnector("exec-1", streamB)
	if err == nil {
		t.Fatal("second RegisterConnector on a live stream must be rejected")
	}
	if !strings.Contains(err.Error(), "registered") {
		t.Fatalf("error must explain the duplicate registration, got %q", err.Error())
	}
	if streamB.sentCount() != 0 {
		t.Fatalf("rejected stream must not receive messages, got %d", streamB.sentCount())
	}
}

func TestSendExecuteOnBoundContainerQueuesUntilRegister(t *testing.T) {
	p := NewProxy()
	p.BindExec("exec-1", "c1")

	job := sampleExecuteJob()
	if err := p.SendExecute("exec-1", job); err != nil {
		t.Fatalf("SendExecute before register: %v", err)
	}

	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	jobs := stream.sentExecutes()
	if len(jobs) != 1 {
		t.Fatalf("expected the bound container's pending job to flush, got %d", len(jobs))
	}
	assertExecuteJob(t, jobs[0], job)
}

// AdoptStream is the warm-pool reuse handoff: the OLD exec is done (clean
// Done, stream kept open, SDK looping on Recv), the pool hands the container
// to a NEW exec. The new exec-ID is never registered on the wire — the worker
// must adopt the live stream under the old exec and route the new ExecuteJob
// onto it immediately.

func TestAdoptStreamFlushesQueuedExecuteOnSameStream(t *testing.T) {
	p := NewProxy()
	p.BindExec("exec-1", "c1")
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	// Clean Done teardown from the drain: index dropped, stream survives.
	p.OnConnectorDown("exec-1")
	p.ReleaseExec("exec-1")

	// Reuse WITHOUT re-binding (the reported deadlock): the new exec's
	// ExecuteJob has no stream routed under it yet, so it queues.
	job := sampleExecuteJob()
	job.ExecutionId = "exec-2"
	job.JobId = "job-2"
	if err := p.SendExecute("exec-2", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}
	if n := len(stream.sentExecutes()); n != 0 {
		t.Fatalf("pre-adopt: ExecuteJob must be queued (no stream under exec-2), got %d", n)
	}

	// Adopt the live stream for exec-2: the queued job must flush NOW on the
	// old stream — the connector SDK is still looping on Recv.
	if err := p.AdoptStream("c1", "exec-2"); err != nil {
		t.Fatalf("AdoptStream: %v", err)
	}
	jobs := stream.sentExecutes()
	if len(jobs) != 1 || jobs[0].GetExecutionId() != "exec-2" || jobs[0].GetJobId() != "job-2" {
		t.Fatalf("expected the queued ExecuteJob flushed on the adopted stream, got %v", jobs)
	}
	if !p.HasStream("exec-2") {
		t.Fatal("stream must be owned by exec-2 after adopt")
	}
	if p.HasStream("exec-1") {
		t.Fatal("exec-1 must not own the stream after adopt")
	}
	// Registration pre-closed: the drain skips the connect timer.
	select {
	case <-p.WaitRegistered("exec-2"):
	default:
		t.Fatal("WaitRegistered(exec-2) must be closed after adopt (stream already connected)")
	}
}

func TestAdoptStreamThenSendExecuteDeliversImmediately(t *testing.T) {
	p := NewProxy()
	p.BindExec("exec-1", "c1")
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	// Drain teardown of the finished execution.
	p.OnConnectorDown("exec-1")
	p.ReleaseExec("exec-1")

	// Manager reuse path: adopt BEFORE SendExecute (no fresh Register).
	if err := p.AdoptStream("c1", "exec-2"); err != nil {
		t.Fatalf("AdoptStream: %v", err)
	}
	job := sampleExecuteJob()
	job.ExecutionId = "exec-2"
	job.JobId = "job-2"
	if err := p.SendExecute("exec-2", job); err != nil {
		t.Fatalf("SendExecute after adopt: %v", err)
	}
	jobs := stream.sentExecutes()
	if len(jobs) != 1 || jobs[0].GetJobId() != "job-2" {
		t.Fatalf("expected 1 immediate ExecuteJob on the adopted stream, got %v", jobs)
	}

	// Reuse chain: exec-2 finishes, exec-3 adopts the same stream again.
	p.OnConnectorDown("exec-2")
	p.ReleaseExec("exec-2")
	if err := p.AdoptStream("c1", "exec-3"); err != nil {
		t.Fatalf("AdoptStream exec-3: %v", err)
	}
	job3 := sampleExecuteJob()
	job3.ExecutionId = "exec-3"
	job3.JobId = "job-3"
	if err := p.SendExecute("exec-3", job3); err != nil {
		t.Fatalf("SendExecute exec-3: %v", err)
	}
	jobs = stream.sentExecutes()
	if len(jobs) != 2 || jobs[1].GetJobId() != "job-3" {
		t.Fatalf("reuse chain broken: %v", jobs)
	}
}

func TestAdoptStreamDoubleAdoptIsSafe(t *testing.T) {
	p := NewProxy()
	p.BindExec("exec-1", "c1")
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}
	p.OnConnectorDown("exec-1")
	p.ReleaseExec("exec-1")

	if err := p.AdoptStream("c1", "exec-2"); err != nil {
		t.Fatalf("first adopt: %v", err)
	}
	if err := p.AdoptStream("c1", "exec-2"); err != nil {
		t.Fatalf("double adopt must be a no-op, got %v", err)
	}
	job := sampleExecuteJob()
	job.ExecutionId = "exec-2"
	job.JobId = "job-2"
	if err := p.SendExecute("exec-2", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}
	if n := len(stream.sentExecutes()); n != 1 {
		t.Fatalf("double adopt must not flush twice, got %d sends", n)
	}
}

func TestAdoptStreamWithoutLiveStreamReturnsError(t *testing.T) {
	p := NewProxy()
	// Bound but never registered (container boot race / dead container).
	p.BindExec("exec-2", "c1")
	job := sampleExecuteJob()
	job.ExecutionId = "exec-2"
	if err := p.SendExecute("exec-2", job); err != nil {
		t.Fatalf("SendExecute: %v", err)
	}
	err := p.AdoptStream("c1", "exec-2")
	if err == nil || !strings.Contains(err.Error(), "no live stream") {
		t.Fatalf("adopt without a live stream must error clearly, got %v", err)
	}

	// Unknown container entirely.
	err = p.AdoptStream("ghost-container", "exec-2")
	if err == nil || !strings.Contains(err.Error(), "no live stream") {
		t.Fatalf("adopt of an unknown container must error clearly, got %v", err)
	}
}

func TestRemoveContainerDropsExecutionIndex(t *testing.T) {
	p := NewProxy()
	p.BindExec("exec-1", "c1")
	p.BindExec("exec-2", "c1")
	stream := &fakeConnectStream{}
	if err := p.RegisterConnector("exec-1", stream); err != nil {
		t.Fatalf("RegisterConnector: %v", err)
	}

	// Sweep path: container removed while idle. Executions bound to it must
	// lose their index (they are done or cancelled).
	p.RemoveContainer("c1")
	if p.HasStream("exec-1") {
		t.Fatal("HasStream must be false after RemoveContainer")
	}
	// Unbound now: a late SendExecute queues pending instead of panicking or
	// routing to a dead container.
	if err := p.SendExecute("exec-2", sampleExecuteJob()); err != nil {
		t.Fatalf("SendExecute after RemoveContainer: %v", err)
	}
	if stream.sentCount() != 0 {
		t.Fatalf("removed container must not receive sends, got %d", stream.sentCount())
	}
}
