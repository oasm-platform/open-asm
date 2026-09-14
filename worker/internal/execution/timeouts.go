package execution

import (
	"fmt"
	"time"
)

// ---------------------------------------------------------------------------
// Timeout contract — single source of truth for every connector-job deadline.
//
// Relationship invariant (enforced by ValidateConnectorTimeouts):
//
//	job timeout (manifest timeoutSeconds)  >  ConnectorConnectTimeout  >  SDK send timeout
//	        optional, when set                 5m (waiting for Register)    30s (cross-repo)
//
// ConnectorConnectTimeout bounds how long an execution may stay up before its
// container connector calls back with Register. If the connector never
// connects (bad image, wrong WORKER_GRPC_ADDR/WORKER_TOKEN) the execution is
// cancelled and the job is failed so Core can finalize it.
// ponytail: make this configurable when tuning is needed.
const ConnectorConnectTimeout = 5 * time.Minute

// ConnectorCleanupTimeout bounds best-effort post-execution container cleanup.
// The cleanup context MUST be detached from the session context: a worker
// reconnect cancelling the session would abort docker Stop/Cleanup immediately
// and orphan the container.
const ConnectorCleanupTimeout = 30 * time.Second

// ConnectorSDKSendTimeout is a cross-repo contract: the oasm-connectors SDK
// sender uses a 30s send timeout per outbound worker message. It lives here so
// both repos name the same value; if the SDK value ever changes, this constant
// MUST change with it (worker/internal/proto/sync_test.go guards the .proto).
const ConnectorSDKSendTimeout = 30 * time.Second

// ConnectorIdleTimeout is how long a pooled container may sit idle (stream
// registered, no execution in flight) before the sweeper stops and removes
// it. 60s default; config.ConnectorIdleTimeout (WORKER_CONNECTOR_IDLE_TIMEOUT)
// exists only for tuning/tests and wins when set.
const ConnectorIdleTimeout = 60 * time.Second

// ConnectorSweepInterval is how often the Manager's sweeper goroutine scans
// the pool for containers idle past ConnectorIdleTimeout.
const ConnectorSweepInterval = 10 * time.Second

// JobTimeoutSecondsKey is the manifest/Job-spec limit key carrying the per-job
// timeout (seconds). The worker reads it from spec.Limits; Core may carry it
// through the jobs proto in the future.
const JobTimeoutSecondsKey = "timeoutSeconds"

// ValidateConnectorTimeouts enforces the invariant that the connector connect
// deadline stays strictly below the per-job timeout: otherwise the connect
// timer fires and cancels the execution before the configured job timeout can
// ever apply, making the manifest timeout dead code. A zero jobTimeoutSeconds
// (no manifest timeout) is unconstrained and valid.
func ValidateConnectorTimeouts(jobTimeoutSeconds int, connectTimeout time.Duration) error {
	if jobTimeoutSeconds <= 0 || connectTimeout < time.Duration(jobTimeoutSeconds)*time.Second {
		return nil
	}
	return fmt.Errorf(
		"connector connect timeout (%s) must be < per-job timeout (%ds); raise timeoutSeconds or lower the connect timeout",
		connectTimeout, jobTimeoutSeconds,
	)
}
