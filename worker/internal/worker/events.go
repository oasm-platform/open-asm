package worker

import "time"

type TuiEventType int

const (
	EventConnected TuiEventType = iota
	EventDisconnected
	EventJobStarted
	EventJobCompleted
	EventJobOutput
	EventActivity
	EventError
	EventMetrics
)

type TuiEvent struct {
	Type      TuiEventType
	Timestamp time.Time
	Source    string // source component (e.g., "RemoteExec", "Jobs")

	// Connected
	WorkerID string
	Host     string
	Port     int

	// Disconnected
	DisconnectReason string

	// Job events
	JobID        string
	Command      string
	AssetID      string
	AssetValue   string
	Success      bool
	Duration     time.Duration
	ErrorMsg     string
	OutputLine   string
	OutputStream string // "stdout" or "stderr"

	// Activity / Error
	ActivityLevel string // "info", "success", "warning", "error"
	Message       string

	// Metrics
	ActiveJobs     int
	MaxConcurrency int
}

// Emit sends an event to the TUI channel without blocking.
// If the channel is full, the event is dropped.
func Emit(events chan<- TuiEvent, event TuiEvent) {
	if events == nil {
		return
	}
	event.Timestamp = time.Now()
	select {
	case events <- event:
	default:
	}
}
