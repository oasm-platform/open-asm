package client

import (
	"context"
	"net"
	"testing"

	jobs_registry "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

// testToken is the worker token the fakes issue on Join and require on every
// subsequent RPC, mirroring core-api's worker-token guard.
const testToken = "tok"

// fakeWorkersService implements workers.WorkersServiceServer for the
// in-process server. Join is the only RPC this test exercises.
type fakeWorkersService struct {
	workers.UnimplementedWorkersServiceServer
}

func (f *fakeWorkersService) Join(context.Context, *workers.JoinRequest) (*workers.JoinResponse, error) {
	return &workers.JoinResponse{WorkerId: "w1", WorkerToken: testToken}, nil
}

// fakeJobsRegistry implements jobs_registry.JobsRegistryServiceServer and
// rejects any RPC whose incoming worker-token metadata does not match
// testToken. ResultVulnerabilities records its request for assertions.
type fakeJobsRegistry struct {
	jobs_registry.UnimplementedJobsRegistryServiceServer
	lastResult *jobs_registry.VulnerabilitiesResultRequest
}

func (f *fakeJobsRegistry) checkToken(ctx context.Context) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Error(codes.Unauthenticated, "missing token")
	}
	if values := md.Get(workerTokenHeader); len(values) != 1 || values[0] != testToken {
		return status.Error(codes.Unauthenticated, "missing token")
	}
	return nil
}

func (f *fakeJobsRegistry) Next(ctx context.Context, _ *jobs_registry.Worker) (*jobs_registry.Job, error) {
	if err := f.checkToken(ctx); err != nil {
		return nil, err
	}
	cmd := "echo hi"
	return &jobs_registry.Job{Id: "j1", Command: &cmd, Category: "vulnerabilities"}, nil
}

func (f *fakeJobsRegistry) ResultVulnerabilities(ctx context.Context, req *jobs_registry.VulnerabilitiesResultRequest) (*jobs_registry.JobResponse, error) {
	if err := f.checkToken(ctx); err != nil {
		return nil, err
	}
	f.lastResult = req
	return &jobs_registry.JobResponse{Success: true}, nil
}

// testServer bundles the in-memory gRPC server and its fakes.
type testServer struct {
	fake *fakeJobsRegistry
	lis  *bufconn.Listener
}

// newTestServer starts a gRPC server on an in-memory bufconn listener with
// the fakes registered. No real network socket is ever opened.
func newTestServer(t *testing.T) *testServer {
	t.Helper()

	lis := bufconn.Listen(1024 * 1024)
	s := grpc.NewServer()
	fake := &fakeJobsRegistry{}
	workers.RegisterWorkersServiceServer(s, &fakeWorkersService{})
	jobs_registry.RegisterJobsRegistryServiceServer(s, fake)
	go s.Serve(lis)
	t.Cleanup(func() {
		s.Stop()
		lis.Close()
	})

	return &testServer{fake: fake, lis: lis}
}

// newClient dials the in-process server through the bufconn dialer.
func (ts *testServer) newClient(t *testing.T) *Client {
	t.Helper()

	c, err := New("passthrough:///bufnet", 0, grpc.WithContextDialer(func(ctx context.Context, addr string) (net.Conn, error) {
		return ts.lis.Dial()
	}))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { c.Close() })

	return c
}

// TestClientRoundTrip exercises the full Join -> Next -> SubmitResult flow
// against an in-process server, proving the worker-token metadata set by
// Join is injected into the subsequent RPCs.
func TestClientRoundTrip(t *testing.T) {
	ts := newTestServer(t)
	c := ts.newClient(t)
	ctx := context.Background()

	workerID, workerToken, err := c.Join(ctx, "some-api-key", "")
	if err != nil {
		t.Fatalf("Join: %v", err)
	}
	if workerID != "w1" || workerToken != testToken {
		t.Fatalf("Join = (%q, %q), want (%q, %q)", workerID, workerToken, "w1", testToken)
	}

	job, err := c.Next(ctx)
	if err != nil {
		t.Fatalf("Next: %v", err)
	}
	if job.Id != "j1" || job.Category != "vulnerabilities" {
		t.Fatalf("Next = (id %q, category %q), want (\"j1\", \"vulnerabilities\")", job.Id, job.Category)
	}

	raw := "raw output"
	if err := c.SubmitResult(ctx, "w1", "j1", "vulnerabilities", false, raw); err != nil {
		t.Fatalf("SubmitResult: %v", err)
	}
	if ts.fake.lastResult == nil {
		t.Fatal("SubmitResult: fake recorded no request")
	}
	got := ts.fake.lastResult
	if got.WorkerId != "w1" || got.JobId != "j1" {
		t.Fatalf("recorded result = (%q, %q), want (\"w1\", \"j1\")", got.WorkerId, got.JobId)
	}
	if got.Error {
		t.Fatal("recorded result has Error=true, want false")
	}
	if got.Raw == nil || *got.Raw != raw {
		t.Fatalf("recorded result Raw = %v, want pointer to %q", got.Raw, raw)
	}

	t.Run("next-without-token", func(t *testing.T) {
		unjoined := ts.newClient(t)
		if _, err := unjoined.Next(ctx); err == nil {
			t.Fatal("Next on unjoined client: got nil error, want Unauthenticated")
		}
	})
}
