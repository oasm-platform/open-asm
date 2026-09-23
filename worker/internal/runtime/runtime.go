package runtime

import "context"

// JobSpec is the single source used everywhere.
type JobSpec struct {
	Tool    string
	Image   string // REQUIRED: resolved by Core from manifest.json
	Version string
	Inputs  map[string]any
	Limits  map[string]any
	TraceID string
	Config  map[string]any // connector config profile passed through from proto
	JobID   string         // proto Job ID, distinct from Tool name
	// ExecID is the worker-side execution identity (Manager's exec-N). It is
	// injected as the container's EXECUTION_ID env so the connector registers
	// under the same ID the proxy queues ExecuteJob under. Empty (direct
	// runtime users) keeps the legacy behavior: DockerRuntime generates a
	// random hex ID.
	ExecID string
	// PoolKey is the normalized (lowercase) container image the Manager
	// resolves; the Docker runtime uses it for the pooled container name
	// (oasm-<tool>-<poolShort>-<rand>) and the oasm.pool_key label. Empty for
	// direct runtime users (legacy naming by execID).
	PoolKey string
	// ConnectorToken is the per-execution single-use connector auth token. It
	// is injected as the container's WORKER_TOKEN env so the Register
	// handshake authenticates against this execution only. Empty keeps the
	// legacy shared-secret behavior (backend compatibility).
	ConnectorToken string
	// WorkerID is the owning worker's identity fingerprint
	// (grpcclient.OwnerID(): hash of WORKER_SIGNATURE or the persisted join
	// token — never the raw secret). Stamped as the oasm.worker_id container
	// label so a restarted worker's ReconcileOrphans can tell its own orphans
	// from a sibling worker's live containers on a shared engine. Empty
	// (direct runtime users) → label omitted → never tier-2 removable by
	// another worker.
	WorkerID string
}

type RuntimeOpts struct {
	CPU            int
	Memory         int
	TimeoutSeconds int
	TraceID        string
}

type Handle struct {
	ID     string
	Labels map[string]string
}

type InspectResult struct {
	Running  bool
	ExitCode int
	Error    string
	// Health is the container's healthcheck status: "", "starting",
	// "healthy" or "unhealthy". Empty = no healthcheck configured (unknown);
	// the worker health monitor keys startup failures off "unhealthy" and
	// non-zero exit codes instead.
	Health string
}

type ExecutionRuntime interface {
	Create(ctx context.Context, spec JobSpec, opts RuntimeOpts) (Handle, error)
	Start(ctx context.Context, h Handle) error
	Stop(ctx context.Context, h Handle) error
	Cancel(ctx context.Context, h Handle) error
	Inspect(ctx context.Context, h Handle) (InspectResult, error)
	Logs(ctx context.Context, h Handle) (<-chan []byte, error)
	Cleanup(ctx context.Context, h Handle) error
}
