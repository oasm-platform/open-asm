package tui

import "time"

// Bubbletea Msg types derived from worker.TuiEvent

type connectMsg struct {
	workerID    string
	host        string
	port        int
	connectedAt time.Time
}

type disconnectMsg struct {
	reason    string
	timestamp time.Time
}

type jobStartedMsg struct {
	id        string
	command   string
	assetID   string
	assetVal  string
	startedAt time.Time
}

type jobCompletedMsg struct {
	id          string
	success     bool
	duration    time.Duration
	errorMsg    string
	completedAt time.Time
}

type jobOutputMsg struct {
	id     string
	line   string
	stream string
}

type activityMsg struct {
	text      string
	level     string
	timestamp time.Time
}

type errorMsg struct {
	source    string
	message   string
	timestamp time.Time
}

type metricsMsg struct {
	activeJobs     int
	maxConcurrency int
}

// tickMsg drives the event channel reader
type tickMsg struct{}

// activeJob tracks a running job in the TUI
type activeJob struct {
	id        string
	command   string
	assetVal  string
	startedAt time.Time
}
