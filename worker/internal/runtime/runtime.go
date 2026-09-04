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
	// ConnectorToken is the per-execution single-use connector auth token. It
	// is injected as the container's WORKER_TOKEN env so the Register
	// handshake authenticates against this execution only. Empty keeps the
	// legacy shared-secret behavior (backend compatibility).
	ConnectorToken string
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
