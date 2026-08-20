package grpcclient

import (
	"fmt"
	"sync"
	"time"

	jobRegistryPb "oasm-worker/internal/gen/jobs_registry"
	workerPb "oasm-worker/internal/gen/workers"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Client wraps the gRPC connection to core-api and the generated service
// stubs, attaching the worker token via PerRPCCredentials on every call.
type Client struct {
	conn     *grpc.ClientConn
	apiKey   string
	toolPath string
	logger   Logger
	auth     *tokenAuth

	workers workerPb.WorkersServiceClient
	jobs    jobRegistryPb.JobsRegistryServiceClient

	mu       sync.RWMutex
	workerID string

	// Unexported for test control (same-package tests only).
	connectBaseDelay time.Duration // default 2s
	connectMaxDelay  time.Duration // default 30s
	reconnectDelay   time.Duration // default 1s
}

// NewClient validates the required configuration and creates a lazily-dialing
// gRPC client for the core-api server.
func NewClient(apiKey, grpcHost, toolPath string, logger Logger, dialOpts ...grpc.DialOption) (*Client, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("api key must not be empty")
	}
	if grpcHost == "" {
		return nil, fmt.Errorf("grpc host must not be empty")
	}
	if toolPath == "" {
		return nil, fmt.Errorf("tool path must not be empty")
	}
	if logger == nil {
		return nil, fmt.Errorf("logger must not be nil")
	}

	auth := &tokenAuth{}
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithPerRPCCredentials(auth),
	}
	opts = append(opts, dialOpts...)

	conn, err := grpc.NewClient(grpcHost, opts...)
	if err != nil {
		return nil, fmt.Errorf("dial grpc server %s: %w", grpcHost, err)
	}

	return &Client{
		conn:             conn,
		apiKey:           apiKey,
		toolPath:         toolPath,
		logger:           logger,
		auth:             auth,
		workers:          workerPb.NewWorkersServiceClient(conn),
		jobs:             jobRegistryPb.NewJobsRegistryServiceClient(conn),
		connectBaseDelay: 2 * time.Second,
		connectMaxDelay:  30 * time.Second,
		reconnectDelay:   1 * time.Second,
	}, nil
}

// Close closes the underlying gRPC connection.
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// WorkerID returns the ID assigned to this worker by the server.
func (c *Client) WorkerID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.workerID
}

// workersClient returns the WorkersService stub.
func (c *Client) workersClient() workerPb.WorkersServiceClient { return c.workers }

// jobsClient returns the JobsRegistryService stub.
func (c *Client) jobsClient() jobRegistryPb.JobsRegistryServiceClient { return c.jobs }
