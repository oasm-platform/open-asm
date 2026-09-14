package connector

import (
	"context"
	"sync"
	"testing"
	"time"

	pb "oasm-worker/internal/gen/connector"
)

// Phase 2 warm-pool keepalive: a clean Done ends the EXECUTION, not the
// container or the stream. The stream stays open so the NEXT execution reuses
// it; the server only tears down on unexpected stream death (sweep/EOF).

// notifierRecorder implements IdleNotifier, recording pool handoffs.
type notifierRecorder struct {
	mu       sync.Mutex
	releases []string
	downs    []string
}

func (n *notifierRecorder) ReleaseToIdle(execID string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.releases = append(n.releases, execID)
}

func (n *notifierRecorder) ContainerDown(execID string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.downs = append(n.downs, execID)
}

func (n *notifierRecorder) released(execID string) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	for _, e := range n.releases {
		if e == execID {
			return true
		}
	}
	return false
}

func (n *notifierRecorder) downed(execID string) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	for _, e := range n.downs {
		if e == execID {
			return true
		}
	}
	return false
}

func waitForNotifier(t *testing.T, ok func() bool, what string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if ok() {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestServerDoneKeepsStreamOpenForReuse(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	notif := &notifierRecorder{}
	srv.SetPoolNotifier(notif)
	conn := dialTestServer(t, srv)

	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-keep-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got %v", ack.GetAccepted())
	}

	// Clean Done: execution over, container goes idle — stream stays open.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{Done: &pb.Done{ExecutionId: "exec-keep-1"}},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
	waitForNotifier(t, func() bool { return notif.released("exec-keep-1") }, "pool ReleaseToIdle(exec-keep-1)")

	if !proxy.HasStream("exec-keep-1") {
		t.Fatal("stream must stay registered after Done (warm pool reuse)")
	}

	// The worker pushes the NEXT execution on the SAME stream: the client
	// (container SDK) must receive it — the server's Connect must still be in
	// its read loop, not returned after Done.
	job := sampleExecuteJob()
	job.ExecutionId = "exec-keep-1"
	job.JobId = "job-2"
	if err := proxy.SendExecute("exec-keep-1", job); err != nil {
		t.Fatalf("SendExecute after Done: %v", err)
	}
	recvd := make(chan *pb.WorkerMessage, 1)
	go func() {
		m, _ := stream.Recv()
		recvd <- m
	}()
	select {
	case m := <-recvd:
		if m == nil || m.GetExecute() == nil || m.GetExecute().GetJobId() != "job-2" {
			t.Fatalf("expected the reused-stream ExecuteJob(job-2), got %v", m)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("stream must deliver ExecuteJob after Done (server must not have returned)")
	}
}

func TestServerRejectsDuplicateRegisterOnLiveStream(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	conn := dialTestServer(t, srv)

	stream1, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-dup-1")
	if !ack.GetAccepted() {
		t.Fatalf("first register must be accepted, got %v", ack.GetAccepted())
	}

	// Second connector stream re-registering the same execution: rejected —
	// one live stream per pooled container.
	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stream2, err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect(2): %v", err)
	}
	if err := stream2.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Register{Register: &pb.Register{Token: "secret", ExecutionId: "exec-dup-1"}},
	}); err != nil {
		t.Fatalf("Send Register(2): %v", err)
	}
	// The server acks the register first, then rejects the redundant stream:
	// the first Recv is the ack, the second must be the rejection error.
	if ack2, err := stream2.Recv(); err != nil {
		t.Fatalf("expected ack before rejection, got %v", err)
	} else if ack2.GetRegisterAck() == nil || !ack2.GetRegisterAck().GetAccepted() {
		t.Fatalf("expected accepted ack on the duplicate register, got %v", ack2)
	}
	if _, err := stream2.Recv(); err == nil {
		t.Fatal("duplicate Register on a live stream must be rejected")
	}

	// Original stream intact and routable.
	if !proxy.HasStream("exec-dup-1") {
		t.Fatal("first stream must survive the rejected duplicate")
	}
	_ = stream1
}

func TestServerReusedStreamDeliversNewExecExecuteJob(t *testing.T) {
	// Warm-pool reuse E2E: exec-1 cleanly Dones (stream kept open), the pool
	// hands the container to exec-2, the proxy adopts the live stream, and the
	// SAME stream must deliver exec-2's ExecuteJob — the connector SDK never
	// re-registers, so the send must go out as "sent", never "queued".
	srv, proxy := startTestServer(t, "secret")
	notif := &notifierRecorder{}
	srv.SetPoolNotifier(notif)
	log := &captureLogger{}
	srv.SetLogger(log)
	proxy.SetLogger(log)
	conn := dialTestServer(t, srv)

	proxy.BindExec("exec-reuse-1", "c1")
	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-reuse-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got %v", ack.GetAccepted())
	}

	// Clean Done: execution over, container idle, stream still open.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{Done: &pb.Done{ExecutionId: "exec-reuse-1"}},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
	waitForNotifier(t, func() bool { return notif.released("exec-reuse-1") }, "pool ReleaseToIdle(exec-reuse-1)")
	// Drain teardown drops exec-1's index entry (stream survives).
	proxy.ReleaseExec("exec-reuse-1")

	// Reuse: adopt the live stream for exec-2, then push its ExecuteJob.
	if err := proxy.AdoptStream("c1", "exec-reuse-2"); err != nil {
		t.Fatalf("AdoptStream: %v", err)
	}
	job := sampleExecuteJob()
	job.ExecutionId = "exec-reuse-2"
	job.JobId = "job-reuse-2"
	if err := proxy.SendExecute("exec-reuse-2", job); err != nil {
		t.Fatalf("SendExecute after adopt: %v", err)
	}

	recvd := make(chan *pb.WorkerMessage, 1)
	go func() {
		m, _ := stream.Recv()
		recvd <- m
	}()
	select {
	case m := <-recvd:
		if m == nil || m.GetExecute() == nil ||
			m.GetExecute().GetExecutionId() != "exec-reuse-2" || m.GetExecute().GetJobId() != "job-reuse-2" {
			t.Fatalf("expected the adopted-stream ExecuteJob(job-reuse-2), got %v", m)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout: ExecuteJob must arrive on the same stream after adopt")
	}
	waitForLog(t, log, "connector execute sent: exec=exec-reuse-2")
	if line, queued := log.find("connector execute queued: exec=exec-reuse-2"); queued {
		t.Fatalf("reuse must send immediately, not queue: %q", line)
	}

	// The stream survives exec-2's Done too (further reuses possible).
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{Done: &pb.Done{ExecutionId: "exec-reuse-2"}},
	}); err != nil {
		t.Fatalf("Send Done(exec-reuse-2): %v", err)
	}
	waitForNotifier(t, func() bool { return notif.released("exec-reuse-2") }, "pool ReleaseToIdle(exec-reuse-2)")
	if !proxy.HasStream("exec-reuse-2") {
		t.Fatal("stream must stay registered after the second Done")
	}
}

func TestServerNotifiesContainerDownOnStreamDeath(t *testing.T) {
	srv, proxy := startTestServer(t, "secret")
	notif := &notifierRecorder{}
	srv.SetPoolNotifier(notif)
	log := &captureLogger{}
	srv.SetLogger(log)
	conn := dialTestServer(t, srv)

	_, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-dead-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true, got %v", ack.GetAccepted())
	}

	// Abrupt client disconnect: unexpected stream death must evict the
	// container from the pool (it can never be reused safely).
	_ = conn.Close()
	waitForNotifier(t, func() bool { return notif.downed("exec-dead-1") }, "pool ContainerDown(exec-dead-1)")
	waitForLog(t, log, "connector stream closed: exec=exec-dead-1")
	if proxy.HasStream("exec-dead-1") {
		t.Fatal("stream must be detached after unexpected death")
	}
}
