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
	EventSessionOutput
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
	SessionOutput   string
	SessionStream   string
	SessionCommand  string

	// System metrics
	CPUUsage    float64
	MemoryUsed  uint64
	MemoryTotal uint64
	MemoryPct   float64
	GoRoutines  int
	HeapAlloc   uint64
	HeapSys     uint64
}

// eventLabel returns a short human-readable label for each event type.
func eventLabel(t TuiEventType) string {
	switch t {
	case EventConnected:
		return "CONNECT"
	case EventDisconnected:
		return "DISCONN"
	case EventJobStarted:
		return "JOB"
	case EventJobCompleted:
		return "JOB"
	case EventJobOutput:
		return "OUTPUT"
	case EventError:
		return "ERROR"
	case EventMetrics:
		return "METRIC"
	case EventSessionCreated:
		return "SESSION"
	case EventSessionCommand:
		return "SESSION"
	case EventSessionClosed:
		return "SESSION"
	case EventSessionOutput:
		return "OUTPUT"
	default:
		return "EVENT"
	}
}

// Emit sends an event to the TUI channel.
// Critical events (completion, connection, error) are always delivered.
// High-volume events (output, activity) are dropped when the channel is full.
// In headless mode (events == nil), important events are logged to stderr.
func Emit(events chan<- TuiEvent, event TuiEvent) {
	if events == nil {
		// Headless mode: write event to stderr instead.
		// TuiLogger calls already log via their own emit() fallback;
		// this handles direct Emit() calls for job/connection lifecycle.
		event.Timestamp = time.Now()
		ts := event.Timestamp.Format(time.RFC3339)
		src := event.Source
		if src == "" {
			src = "Core"
		}

		switch event.Type {
		case EventMetrics:
			// High volume (1s ticker) — skip in headless mode.
		case EventJobStarted:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] Started: cmd=%q asset=%s id=%s\n",
				ts, eventLabel(event.Type), src, event.Command, event.AssetValue, event.JobID)
		case EventJobCompleted:
			status := "success"
			if !event.Success {
				status = "FAILED"
			}
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] %s: id=%s duration=%s msg=%q\n",
				ts, eventLabel(event.Type), src, status, event.JobID, event.Duration, event.ErrorMsg)
		case EventJobOutput:
			line := event.OutputLine
			if len(line) > 300 {
				line = line[:300] + "..."
			}
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] %s\n", ts, eventLabel(event.Type), src, line)
		case EventSessionOutput:
			line := event.SessionOutput
			if len(line) > 300 {
				line = line[:300] + "..."
			}
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] %s\n", ts, eventLabel(event.Type), src, line)
		case EventConnected:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] Connected: worker=%s host=%s:%d\n",
				ts, eventLabel(event.Type), src, event.WorkerID, event.Host, event.Port)
		case EventDisconnected:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] %s\n",
				ts, eventLabel(event.Type), src, event.DisconnectReason)
		case EventSessionCreated:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] Created: session=%s\n",
				ts, eventLabel(event.Type), src, event.SessionID)
		case EventSessionClosed:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] Closed: session=%s\n",
				ts, eventLabel(event.Type), src, event.SessionID)
		case EventSessionCommand:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] Exec: cmd=%q session=%s\n",
				ts, eventLabel(event.Type), src, event.SessionCommand, event.SessionID)
		case EventError:
			fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] %s\n",
				ts, eventLabel(event.Type), src, event.Message)
		default:
			// EventActivity etc — typically logged via TuiLogger's own emit().
			// Silent skip here to avoid double-logging.
		}
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

	// Headless mode: no TUI channel — write directly to stderr.
	// oasm-sdk-go logs are still redirected to /dev/null by the caller.
	if l.events == nil {
		ts := time.Now().Format(time.RFC3339)
		fmt.Fprintf(os.Stderr, "[%s] %-7s [%s] %s\n", ts, level, l.source, formatted)
		return
	}

	Emit(l.events, TuiEvent{
		Type:          EventActivity,
		Source:        l.source,
		ActivityLevel: level,
		Message:       formatted,
	})
}
