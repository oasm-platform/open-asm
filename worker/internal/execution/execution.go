package execution

import "oasm-worker/internal/runtime"

// JobSpec is a single-source alias to runtime.JobSpec (Tool, Image, Version, Inputs, Limits, TraceID).
// Image is REQUIRED via Core ConnectorRegistry (1.5); Worker never resolves manifest itself.
type JobSpec = runtime.JobSpec
type Handle = runtime.Handle

type State string

const (
	StateRunning   State = "running"
	StateCancelled State = "cancelled"
	StateDone      State = "done"
)

// Execution is per-execution state tracked by Manager.
type Execution struct {
	ID     string
	Spec   JobSpec
	State  State
	Handle Handle
}
