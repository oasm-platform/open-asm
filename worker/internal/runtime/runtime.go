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
