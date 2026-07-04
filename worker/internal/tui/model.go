package tui

import (
	"fmt"
	"oasm-worker/internal/config"
	"oasm-worker/internal/worker"
	"strings"
	"time"

	"charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
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
	return tea.Batch(waitForEvent(m.events))
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.resize()
		return m, nil

	case tea.KeyPressMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "tab":
			m.focus = (m.focus + 1) % 3
			m.statusBar.setFocus(m.focus)
			return m, nil
		case "shift+tab":
			m.focus = (m.focus + 2) % 3
			m.statusBar.setFocus(m.focus)
			return m, nil
		case "up", "k":
			if m.focus == focusJobs {
				cmd := m.jobsTable.update(msg)
				cmds = append(cmds, cmd)
				if id := m.jobsTable.selectedID(); id != m.outputVP.selectedID {
					m.outputVP.setSelected(id)
				}
				return m, tea.Batch(cmds...)
			}
		case "down", "j":
			if m.focus == focusJobs {
				cmd := m.jobsTable.update(msg)
				cmds = append(cmds, cmd)
				if id := m.jobsTable.selectedID(); id != m.outputVP.selectedID {
					m.outputVP.setSelected(id)
				}
				return m, tea.Batch(cmds...)
			}
		}

		if m.focus == focusJobs {
			cmds = append(cmds, m.jobsTable.update(msg))
		} else if m.focus == focusOutput {
			cmds = append(cmds, m.outputVP.update(msg))
		} else if m.focus == focusEvents {
			cmds = append(cmds, m.eventsList.update(msg))
		}
	}

	switch msg := msg.(type) {
	case connectMsg:
		m.headerComp.update(msg)
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Connected to %s:%d", msg.host, msg.port),
			level:     "success",
			timestamp: msg.connectedAt,
		})
	case disconnectMsg:
		m.headerComp.update(msg)
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Disconnected: %s", msg.reason),
			level:     "warning",
			timestamp: msg.timestamp,
		})
	case jobStartedMsg:
		m.jobsTable.handleJobStarted(msg)
		m.headerComp.update(metricsMsg{activeJobs: len(m.jobsTable.jobs), maxConcurrency: m.maxConcurrency})
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Job %s started", msg.id[:min(len(msg.id), 8)]),
			level:     "info",
			timestamp: msg.startedAt,
		})
		if len(m.jobsTable.jobs) == 1 {
			m.outputVP.setSelected(msg.id)
		}
	case jobCompletedMsg:
		m.jobsTable.handleJobCompleted(msg)
		m.headerComp.update(metricsMsg{activeJobs: len(m.jobsTable.jobs), maxConcurrency: m.maxConcurrency})
		level := "success"
		status := "completed"
		if !msg.success {
			level = "error"
			status = "failed"
		}
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Job %s %s", msg.id[:min(len(msg.id), 8)], status),
			level:     level,
			timestamp: msg.completedAt,
		})
	case jobOutputMsg:
		m.outputVP.appendLine(msg.id, msg.line)
	case activityMsg:
		m.eventsList.addEvent(activityEntry{text: msg.text, level: msg.level, timestamp: msg.timestamp})
	case errorMsg:
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("[%s] %s", msg.source, msg.message),
			level:     "error",
			timestamp: msg.timestamp,
		})
	case metricsMsg:
		m.headerComp.update(msg)
	}

	cmds = append(cmds, waitForEvent(m.events))
	return m, tea.Batch(cmds...)
}

func (m *Model) resize() {
	if m.width == 0 || m.height == 0 {
		return
	}

	// Layout: header(2) + gap(1) + jobs(10) + gap(1) + bottom(rest) + statusbar(1)
	// Total borders: 4 horizontal lines between sections
	headerLines := 2
	gapLines := 1
	jobsLines := 10
	statusBarLines := 1
	bottomLines := m.height - headerLines - gapLines*2 - jobsLines - statusBarLines
	if bottomLines < 4 {
		bottomLines = 4
	}

	eventsW := m.width * 35 / 100
	outputW := m.width - eventsW

	m.jobsTable.table.SetHeight(jobsLines - 2)
	m.jobsTable.table.SetWidth(m.width - 4)
	m.outputVP.setDimensions(outputW-2, bottomLines-2)
	m.eventsList.setDimensions(eventsW-2, bottomLines-2)
}

func (m Model) View() tea.View {
	if m.width == 0 || m.height == 0 {
		return tea.NewView("Initializing...")
	}
	if m.width < 80 || m.height < 20 {
		return tea.NewView(fmt.Sprintf("Terminal too small (%dx%d). Need 80x20.", m.width, m.height))
	}

	// Recalculate
	headerLines := 2
	gapLines := 1
	jobsLines := 10
	statusBarLines := 1
	bottomLines := m.height - headerLines - gapLines*2 - jobsLines - statusBarLines
	if bottomLines < 4 {
		bottomLines = 4
	}

	eventsW := m.width * 35 / 100
	outputW := m.width - eventsW

	m.outputVP.setDimensions(outputW-2, bottomLines-2)
	m.eventsList.setDimensions(eventsW-2, bottomLines-2)

	// Style for bordered panels
	bordered := func(content string, w, h int) string {
		return lipgloss.NewStyle().
			Width(w).
			Height(h).
			Border(lipgloss.NormalBorder()).
			Render(content)
	}

	// === Header (2 lines) ===
	header := bordered(m.headerComp.View(m.width-4), m.width, headerLines)

	// === Jobs table (10 lines) ===
	jobs := bordered(m.jobsTable.View(m.width-4), m.width, jobsLines)

	// === Bottom: output + events side by side ===
	output := bordered(m.outputVP.View(), outputW, bottomLines)
	events := bordered(m.eventsList.View(), eventsW, bottomLines)
	bottom := lipgloss.JoinHorizontal(lipgloss.Top, output, events)

	// === Status bar ===
	statusBar := m.statusBar.View(m.width)

	// === Assemble ===
	return tea.NewView(strings.Join([]string{
		header,
		jobs,
		bottom,
		statusBar,
	}, "\n"))
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
		return connectMsg{workerID: event.WorkerID, host: event.Host, port: event.Port, connectedAt: event.Timestamp}
	case worker.EventDisconnected:
		return disconnectMsg{reason: event.DisconnectReason, timestamp: event.Timestamp}
	case worker.EventJobStarted:
		return jobStartedMsg{id: event.JobID, command: event.Command, assetID: event.AssetID, assetVal: event.AssetValue, startedAt: event.Timestamp}
	case worker.EventJobCompleted:
		return jobCompletedMsg{id: event.JobID, success: event.Success, duration: event.Duration, errorMsg: event.ErrorMsg, completedAt: event.Timestamp}
	case worker.EventJobOutput:
		return jobOutputMsg{id: event.JobID, line: event.OutputLine, stream: event.OutputStream}
	case worker.EventActivity:
		return activityMsg{text: event.Message, level: event.ActivityLevel, timestamp: event.Timestamp}
	case worker.EventError:
		return errorMsg{source: event.Source, message: event.Message, timestamp: event.Timestamp}
	case worker.EventMetrics:
		return metricsMsg{activeJobs: event.ActiveJobs, maxConcurrency: event.MaxConcurrency}
	}
	return nil
}
