package grpcclient

import (
	"context"
	"net"
	"sync"
	"testing"

	jobsRegistry "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

// --- Hook-driven fake WorkersService ---

type fakeWorkersService struct {
	workers.UnimplementedWorkersServiceServer

	// Hook functions — tests override these to control behavior.
	// Default: return Unimplemented errors.
	joinFn         func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error)
	aliveFn        func(req *workers.AliveRequest, srv workers.WorkersService_AliveServer) error
	storageFn      func(req *workers.StorageRequest, srv workers.WorkersService_StorageServer) error
	manifestFn     func(ctx context.Context, req *workers.GetManifestRequest) (*workers.GetManifestResponse, error)
	connectNetFn   func(ctx context.Context, req *workers.ConnectInternalNetworkRequest) (*workers.ConnectInternalNetworkResponse, error)
	registryFn     func(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error)
	subscribeFn    func(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error
	resultStreamFn func(ctx context.Context, req *workers.RemoteExecuteResultStream) (*workers.RemoteExecuteResultAck, error)

	// Recording fields
	mu        sync.Mutex
	joinCalls []joinCall
}

type joinCall struct {
	apiKey   string
	metadata *workers.WorkerMetadata
}

func (f *fakeWorkersService) Join(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
	f.mu.Lock()
	f.joinCalls = append(f.joinCalls, joinCall{apiKey: req.ApiKey, metadata: req.Metadata})
	f.mu.Unlock()
	if f.joinFn != nil {
		return f.joinFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "join not configured")
}

func (f *fakeWorkersService) Alive(req *workers.AliveRequest, srv workers.WorkersService_AliveServer) error {
	if f.aliveFn != nil {
		return f.aliveFn(req, srv)
	}
	return status.Error(codes.Unimplemented, "alive not configured")
}

func (f *fakeWorkersService) Storage(req *workers.StorageRequest, srv workers.WorkersService_StorageServer) error {
	if f.storageFn != nil {
		return f.storageFn(req, srv)
	}
	return status.Error(codes.Unimplemented, "storage not configured")
}

func (f *fakeWorkersService) GetManifest(ctx context.Context, req *workers.GetManifestRequest) (*workers.GetManifestResponse, error) {
	if f.manifestFn != nil {
		return f.manifestFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "manifest not configured")
}

func (f *fakeWorkersService) ConnectInternalNetwork(ctx context.Context, req *workers.ConnectInternalNetworkRequest) (*workers.ConnectInternalNetworkResponse, error) {
	if f.connectNetFn != nil {
		return f.connectNetFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "connect internal network not configured")
}

func (f *fakeWorkersService) BuiltinToolRegistry(ctx context.Context, req *workers.BuiltinToolRegistryRequest) (*workers.BuiltinToolRegistryResponse, error) {
	if f.registryFn != nil {
		return f.registryFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "builtin tool registry not configured")
}

func (f *fakeWorkersService) RemoteExecuteSubscribe(req *workers.RemoteExecuteSubscribeRequest, srv workers.WorkersService_RemoteExecuteSubscribeServer) error {
	if f.subscribeFn != nil {
		return f.subscribeFn(req, srv)
	}
	return status.Error(codes.Unimplemented, "remote execute subscribe not configured")
}

func (f *fakeWorkersService) RemoteExecuteResult(ctx context.Context, req *workers.RemoteExecuteResultStream) (*workers.RemoteExecuteResultAck, error) {
	if f.resultStreamFn != nil {
		return f.resultStreamFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "remote execute result not configured")
}

// --- Hook-driven fake JobsRegistryService ---

type fakeJobsRegistryService struct {
	jobsRegistry.UnimplementedJobsRegistryServiceServer

	nextFn               func(ctx context.Context, req *jobsRegistry.Worker) (*jobsRegistry.Job, error)
	resultFn             func(ctx context.Context, req *jobsRegistry.JobResultRequest) (*jobsRegistry.JobResponse, error)
	resultSubdomainsFn   func(ctx context.Context, req *jobsRegistry.SubdomainResultRequest) (*jobsRegistry.JobResponse, error)
	resultHttpProbeFn    func(ctx context.Context, req *jobsRegistry.HttpProbeResultRequest) (*jobsRegistry.JobResponse, error)
	resultPortsFn        func(ctx context.Context, req *jobsRegistry.PortsResultRequest) (*jobsRegistry.JobResponse, error)
	resultVulnsFn        func(ctx context.Context, req *jobsRegistry.VulnerabilitiesResultRequest) (*jobsRegistry.JobResponse, error)
	resultScreenshotFn   func(ctx context.Context, req *jobsRegistry.ScreenshotResultRequest) (*jobsRegistry.JobResponse, error)

	mu           sync.Mutex
	lastMetadata metadata.MD // captured from incoming context
}

func (f *fakeJobsRegistryService) recordMetadata(ctx context.Context) {
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		f.mu.Lock()
		f.lastMetadata = md
		f.mu.Unlock()
	}
}

func (f *fakeJobsRegistryService) Next(ctx context.Context, req *jobsRegistry.Worker) (*jobsRegistry.Job, error) {
	f.recordMetadata(ctx)
	if f.nextFn != nil {
		return f.nextFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "next not configured")
}

func (f *fakeJobsRegistryService) Result(ctx context.Context, req *jobsRegistry.JobResultRequest) (*jobsRegistry.JobResponse, error) {
	f.recordMetadata(ctx)
	if f.resultFn != nil {
		return f.resultFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "result not configured")
}

func (f *fakeJobsRegistryService) ResultSubdomains(ctx context.Context, req *jobsRegistry.SubdomainResultRequest) (*jobsRegistry.JobResponse, error) {
	f.recordMetadata(ctx)
	if f.resultSubdomainsFn != nil {
		return f.resultSubdomainsFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "result subdomains not configured")
}

func (f *fakeJobsRegistryService) ResultHttpProbe(ctx context.Context, req *jobsRegistry.HttpProbeResultRequest) (*jobsRegistry.JobResponse, error) {
	f.recordMetadata(ctx)
	if f.resultHttpProbeFn != nil {
		return f.resultHttpProbeFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "result http probe not configured")
}

func (f *fakeJobsRegistryService) ResultPorts(ctx context.Context, req *jobsRegistry.PortsResultRequest) (*jobsRegistry.JobResponse, error) {
	f.recordMetadata(ctx)
	if f.resultPortsFn != nil {
		return f.resultPortsFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "result ports not configured")
}

func (f *fakeJobsRegistryService) ResultVulnerabilities(ctx context.Context, req *jobsRegistry.VulnerabilitiesResultRequest) (*jobsRegistry.JobResponse, error) {
	f.recordMetadata(ctx)
	if f.resultVulnsFn != nil {
		return f.resultVulnsFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "result vulnerabilities not configured")
}

func (f *fakeJobsRegistryService) ResultScreenshot(ctx context.Context, req *jobsRegistry.ScreenshotResultRequest) (*jobsRegistry.JobResponse, error) {
	f.recordMetadata(ctx)
	if f.resultScreenshotFn != nil {
		return f.resultScreenshotFn(ctx, req)
	}
	return nil, status.Error(codes.Unimplemented, "result screenshot not configured")
}

// --- bufconn test server ---

type testServer struct {
	lis        *bufconn.Listener
	grpcSrv    *grpc.Server
	workersSrv *fakeWorkersService
	jobsSrv    *fakeJobsRegistryService
	client     *Client
	t          *testing.T
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	lis := bufconn.Listen(64 * 1024)
	grpcSrv := grpc.NewServer()
	workersSrv := &fakeWorkersService{}
	jobsSrv := &fakeJobsRegistryService{}
	workers.RegisterWorkersServiceServer(grpcSrv, workersSrv)
	jobsRegistry.RegisterJobsRegistryServiceServer(grpcSrv, jobsSrv)
	go func() { _ = grpcSrv.Serve(lis) }()

	// Create Client with bufconn dialer. The passthrough:/// scheme makes
	// grpc.NewClient invoke the custom dialer instead of resolving via DNS.
	client, err := NewClient("test-api-key", "passthrough:///bufnet", "test-tools", &noOpLogger{},
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}
	t.Cleanup(func() {
		_ = client.Close()
		grpcSrv.Stop()
	})

	return &testServer{
		lis:        lis,
		grpcSrv:    grpcSrv,
		workersSrv: workersSrv,
		jobsSrv:    jobsSrv,
		client:     client,
		t:          t,
	}
}