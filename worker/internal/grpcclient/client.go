package grpcclient

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	jobRegistryPb "oasm-worker/internal/gen/jobs_registry"
	workerPb "oasm-worker/internal/gen/workers"
)

// tokenFileName is the default location of the persisted worker token,
// relative to the process working directory (the worker workspace root).
// Override with the WORKER_TOKEN_FILE environment variable.
const tokenFileName = ".worker-token"

// Client wraps the gRPC connection to core-api and the generated service
// stubs, attaching the worker token via PerRPCCredentials on every call.
type Client struct {
	conn     *grpc.ClientConn
	apiKey   string
	toolPath string
	runMode  string // "cli", "node", or "" (unknown)
	logger   Logger
	auth     *tokenAuth

	// tokenFile is where the worker token is persisted across restarts so a
	// rejoin can recover the same worker identity (core matches on the token).
	// signature is sent with Join when WORKER_SIGNATURE is configured.
	tokenFile string
	signature string

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
// gRPC client for the core-api server. A worker token persisted by a previous
// run is loaded here (before Connect) so the first Join can rejoin with the
// same identity; a missing file just means the server assigns a new one.
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

	c := &Client{
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
	}

	c.tokenFile = resolveTokenFilePath()
	c.signature = os.Getenv("WORKER_SIGNATURE")
	if tok := readTokenFile(c.tokenFile); tok != "" {
		auth.setToken(tok)
		logger.Verbose("resumed worker token from %s", c.tokenFile)
	} else {
		// First ever run (or a lost file). Core's autoCleanupWorkersAndJobs
		// reaps any orphaned IN_PROGRESS jobs, so a fresh identity is safe.
		logger.Warning("no worker token file at %s — will register as a NEW worker on join (core auto-cleanup reaps orphaned jobs)", c.tokenFile)
	}

	return c, nil
}

// resolveTokenFilePath returns WORKER_TOKEN_FILE when set, otherwise the
// workspace-root default (<cwd>/.worker-token).
func resolveTokenFilePath() string {
	if p := os.Getenv("WORKER_TOKEN_FILE"); p != "" {
		return p
	}
	cwd, err := os.Getwd()
	if err != nil {
		return tokenFileName
	}
	return filepath.Join(cwd, tokenFileName)
}

// readTokenFile returns the trimmed worker token from path, or "" when the
// file is missing or empty (both states mean "no identity to resume").
func readTokenFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
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

// SetRunMode stores the worker run mode ("cli", "node", or "") which is
// sent in metadata during Join. Must be called before Connect.
func (c *Client) SetRunMode(mode string) {
	c.runMode = mode
}
