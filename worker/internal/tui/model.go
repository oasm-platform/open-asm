package tui

import (
	"oasm-worker/internal/config"
	"oasm-worker/internal/worker"
	"time"

	"charm.land/bubbletea/v2"
)

type focusTarget int

const (
	focusJobs focusTarget = iota
	focusOutput
	focusEvents
)

type Model struct {
	cfg    *config.Config
	events <-chan worker.TuiEvent

	connected   bool
	workerID    string
	host        string
	port        int
	connectedAt time.Time

	jobs        []activeJob
	selectedJob int

	outputLines map[string][]string

	activities []activityEntry

	activeJobs     int
	maxConcurrency int

	focus focusTarget

	width  int
	height int

	headerComp headerModel
	jobsTable  jobsModel
	outputVP   outputModel
	eventsList eventsModel
	statusBar  statusBarModel
}

type activityEntry struct {
	text      string
	level     string
	timestamp time.Time
}

func NewModel(cfg *config.Config, events <-chan worker.TuiEvent) Model {
	m := Model{
		cfg:            cfg,
		events:         events,
		outputLines:    make(map[string][]string),
		maxConcurrency: cfg.MaxConcurrency,
	}

	m.headerComp = newHeaderModel()
	m.jobsTable = newJobsModel()
	m.outputVP = newOutputModel()
	m.eventsList = newEventsModel()
	m.statusBar = newStatusBarModel()

	return m
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		waitForEvent(m.events),
	)
}

func waitForEvent(events <-chan worker.TuiEvent) tea.Cmd {
	return func() tea.Msg {
		event, ok := <-events
		if !ok {
			return tea.Quit
		}
		return eventToMsg(event)
	}
}

func eventToMsg(event worker.TuiEvent) tea.Msg {
	switch event.Type {
	case worker.EventConnected:
		return connectMsg{
			workerID:    event.WorkerID,
			host:        event.Host,
			port:        event.Port,
			connectedAt: event.Timestamp,
		}
	case worker.EventDisconnected:
		return disconnectMsg{
			reason:    event.DisconnectReason,
			timestamp: event.Timestamp,
		}
	case worker.EventJobStarted:
		return jobStartedMsg{
			id:        event.JobID,
			command:   event.Command,
			assetID:   event.AssetID,
			assetVal:  event.AssetValue,
			startedAt: event.Timestamp,
		}
	case worker.EventJobCompleted:
		return jobCompletedMsg{
			id:          event.JobID,
			success:     event.Success,
			duration:    event.Duration,
			errorMsg:    event.ErrorMsg,
			completedAt: event.Timestamp,
		}
	case worker.EventJobOutput:
		return jobOutputMsg{
			id:     event.JobID,
			line:   event.OutputLine,
			stream: event.OutputStream,
		}
	case worker.EventActivity:
		return activityMsg{
			text:      event.Message,
			level:     event.ActivityLevel,
			timestamp: event.Timestamp,
		}
	case worker.EventError:
		return errorMsg{
			source:    event.Source,
			message:   event.Message,
			timestamp: event.Timestamp,
		}
	case worker.EventMetrics:
		return metricsMsg{
			activeJobs:     event.ActiveJobs,
			maxConcurrency: event.MaxConcurrency,
		}
	default:
		return nil
	}
}

// Stubs — replaced in Tasks 4-8
type headerModel struct{}

func newHeaderModel() headerModel                    { return headerModel{} }
func (h *headerModel) update(msg tea.Msg)            {}
func (h headerModel) View(width int) string          { return "" }

type jobsModel struct{ table interface{} }

func newJobsModel() jobsModel                        { return jobsModel{} }
func (j *jobsModel) update(msg tea.Msg) tea.Cmd      { return nil }
func (j *jobsModel) handleJobStarted(msg jobStartedMsg)  {}
func (j *jobsModel) handleJobCompleted(msg jobCompletedMsg) {}
func (j jobsModel) selectedID() string               { return "" }
func (j jobsModel) View(width int) string            { return "" }

type outputModel struct{}

func newOutputModel() outputModel                    { return outputModel{} }
func (o *outputModel) update(msg tea.Msg) tea.Cmd    { return nil }
func (o *outputModel) setSelected(id string)         {}
func (o *outputModel) appendLine(id, line string)    {}
func (o *outputModel) setDimensions(w, h int)        {}
func (o outputModel) View() string                   { return "" }

type eventsModel struct{}

func newEventsModel() eventsModel                    { return eventsModel{} }
func (e *eventsModel) update(msg tea.Msg) tea.Cmd    { return nil }
func (e *eventsModel) addEvent(entry activityEntry)  {}
func (e *eventsModel) setDimensions(w, h int)        {}
func (e eventsModel) View() string                   { return "" }

type statusBarModel struct{ focus focusTarget }

func newStatusBarModel() statusBarModel              { return statusBarModel{} }
func (s *statusBarModel) setFocus(f focusTarget)     { s.focus = f }
func (s statusBarModel) View(width int) string       { return "" }
