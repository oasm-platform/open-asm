package worker

import (
	"fmt"
	"os"
	"time"
)

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
	EventSessionCreated
	EventSessionCommand
	EventSessionClosed
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

	// Session events
	SessionID       string
	SessionCmdCount int
	SessionActive   bool

	// System metrics
	CPUUsage    float64
	MemoryUsed  uint64
	MemoryTotal uint64
	MemoryPct   float64
	GoRoutines  int
	HeapAlloc   uint64
	HeapSys     uint64
}

// Emit sends an event to the TUI channel.
// Critical events (completion, connection, error) are always delivered.
// High-volume events (output, activity) are dropped when the channel is full.
func Emit(events chan<- TuiEvent, event TuiEvent) {
	if events == nil {
		return
	}
	event.Timestamp = time.Now()
	switch event.Type {
	case EventJobCompleted, EventConnected, EventDisconnected, EventError:
		select {
		case events <- event:
		default:
			// Critical event dropped — channel full. This should not happen
			// in normal operation; log to stderr for diagnostics.
			fmt.Fprintf(os.Stderr, "warning: critical TUI event dropped (type=%d)\n", event.Type)
		}
	default:
		select {
		case events <- event:
		default:
		}
	}
}

// TuiLogger routes log messages to the TUI events feed.
type TuiLogger struct {
	events chan<- TuiEvent
	source string
}

func NewTuiLogger(events chan<- TuiEvent, source string) *TuiLogger {
	return &TuiLogger{events: events, source: source}
}

func (l *TuiLogger) Info(msg string, args ...any) {
	l.emit("info", msg, args...)
}

func (l *TuiLogger) Success(msg string, args ...any) {
	l.emit("success", msg, args...)
}

func (l *TuiLogger) Warning(msg string, args ...any) {
	l.emit("warning", msg, args...)
}

func (l *TuiLogger) Error(msg string, args ...any) {
	l.emit("error", msg, args...)
}

func (l *TuiLogger) ErrorE(msg string, err error) {
	l.emit("error", "%s: %v", msg, err)
}

func (l *TuiLogger) Verbose(msg string, args ...any) {
	l.emit("info", msg, args...)
}

func (l *TuiLogger) Debug(msg string, args ...any) {
	l.emit("info", msg, args...)
}

func (l *TuiLogger) emit(level, msg string, args ...any) {
	formatted := msg
	if len(args) > 0 {
		formatted = fmt.Sprintf(msg, args...)
	}
	Emit(l.events, TuiEvent{
		Type:          EventActivity,
		Source:        l.source,
		ActivityLevel: level,
		Message:       formatted,
	})
}
