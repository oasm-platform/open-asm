package grpcclient

import (
	"crypto/tls"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"oasm-worker/internal/config"
	"oasm-worker/internal/filelock"
	jobRegistryPb "oasm-worker/internal/gen/jobs_registry"
	workerPb "oasm-worker/internal/gen/workers"
)

// tokenFileName is the persisted worker token's file name inside the per-user
// data dir (~/.oasm). Override with the WORKER_TOKEN_FILE environment variable.
const tokenFileName = ".worker-token"

// Client wraps the gRPC connection to core-api and the generated service
// stubs, attaching the worker token via PerRPCCredentials on every call.
type Client struct {
	conn              *grpc.ClientConn
	apiKey            string
	toolPath          string
	runMode           string // "cli", "node", or "" (unknown)
	logger            Logger
	auth              *tokenAuth
	telemetryProvider TelemetryProvider
	telemetrySequence atomic.Uint64

	// tokenFile is where the worker token is persisted across restarts so a
	// rejoin can recover the same worker identity (core matches on the token).
	tokenFile string
	// tokenLock holds tokenFile's slot so no concurrent worker sharing the
	// location resumes the same identity (see claimTokenFile). Nil = unlocked.
	tokenLock *filelock.Lock

	workers workerPb.WorkersServiceClient
	jobs    jobRegistryPb.JobsRegistryServiceClient

	mu       sync.RWMutex
	workerID string

	// Unexported for test control (same-package tests only).
	connectBaseDelay time.Duration // default 2s
	connectMaxDelay  time.Duration // default 30s
	reconnectDelay   time.Duration // default 1s

	telemetryBaseDelay   time.Duration // default 1s
	telemetryMaxDelay    time.Duration // default 30s
	telemetryCallTimeout time.Duration // default 3s

	// streamCancel handles a job cancellation pushed by core-api over the
	// bidirectional stream. Set once at startup (before Connect); nil means the
	// stream is still opened but cancels are ignored.
	streamCancelMu sync.RWMutex
	streamCancel   StreamCancelFunc

	// agentSandbox is advertised on RemoteExecuteSubscribe (x-agent-sandbox)
	// when agent shell commands run in a per-session sandbox container.
	agentSandbox atomic.Bool
}

// WithTLS makes NewClient dial core-api over TLS, verified against the system
// CA pool (e.g. Cloudflare's edge certificate on :443). It overrides the
// default plaintext credentials because later dial options win.
func WithTLS() grpc.DialOption {
	return grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{MinVersion: tls.VersionTLS12}))
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
		conn:                 conn,
		apiKey:               apiKey,
		toolPath:             toolPath,
		logger:               logger,
		auth:                 auth,
		workers:              workerPb.NewWorkersServiceClient(conn),
		jobs:                 jobRegistryPb.NewJobsRegistryServiceClient(conn),
		connectBaseDelay:     2 * time.Second,
		connectMaxDelay:      30 * time.Second,
		reconnectDelay:       1 * time.Second,
		telemetryBaseDelay:   1 * time.Second,
		telemetryMaxDelay:    30 * time.Second,
		telemetryCallTimeout: 3 * time.Second,
	}

	c.tokenFile, c.tokenLock = claimTokenFile(resolveTokenFilePath(), logger)
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
// per-user default (~/.oasm/.worker-token).
func resolveTokenFilePath() string {
	if p := os.Getenv("WORKER_TOKEN_FILE"); p != "" {
		return p
	}
	return config.DataPath(tokenFileName)
}

// maxTokenSlots bounds how many live workers can share one token location:
// replicas of a scaled compose service on one state volume, or several worker
// processes run by one user.
const maxTokenSlots = 64

// claimTokenFile picks this process's token file: the first slot of base whose
// lock no live worker holds. Slot 0 is base itself, so a lone worker keeps
// resuming its existing identity; slot n is base.n. The lock is held until
// Close or process exit. Without it, workers sharing the location would resume
// the SAME identity, and a restarting one's orphan reconcile would remove its
// siblings' running connectors as its own. Any failure other than contention
// (e.g. a read-only dir) falls back to base unlocked — the historic behavior.
func claimTokenFile(base string, logger Logger) (string, *filelock.Lock) {
	if err := os.MkdirAll(filepath.Dir(base), 0o700); err != nil {
		logger.Warning("cannot lock a worker token slot next to %s (%v) — using it unlocked", base, err)
		return base, nil
	}
	for i := 0; i < maxTokenSlots; i++ {
		path := base
		if i > 0 {
			path = fmt.Sprintf("%s.%d", base, i)
		}
		lock, err := filelock.TryLock(path + ".lock")
		if errors.Is(err, filelock.ErrLocked) {
			continue
		}
		if err != nil {
			logger.Warning("cannot lock worker token slot %s (%v) — using %s unlocked", path, err, base)
			return base, nil
		}
		if i > 0 {
			logger.Info("worker token slot %d (%s): another worker holds the lower slots", i, path)
		}
		return path, lock
	}
	logger.Warning("all %d worker token slots of %s are held — using it unlocked", maxTokenSlots, base)
	return base, nil
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

// Close closes the underlying gRPC connection and releases the token slot.
func (c *Client) Close() error {
	_ = c.tokenLock.Unlock()
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

// SetStreamCancelHandler registers the callback invoked when core-api asks this
// worker to stop a job over the bidirectional stream. Must be called before
// Connect; passing nil disables cancel handling.
func (c *Client) SetStreamCancelHandler(fn StreamCancelFunc) {
	c.streamCancelMu.Lock()
	defer c.streamCancelMu.Unlock()
	c.streamCancel = fn
}

func (c *Client) streamCancelHandler() StreamCancelFunc {
	c.streamCancelMu.RLock()
	defer c.streamCancelMu.RUnlock()
	return c.streamCancel
}

// SetRunMode stores the worker run mode ("cli", "node", or "") which is
// sent in metadata during Join. Must be called before Connect.
func (c *Client) SetRunMode(mode string) {
	c.runMode = mode
}
