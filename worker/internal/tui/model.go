package tui

import (
	"fmt"
	"oasm-worker/internal/config"
	"oasm-worker/internal/worker"
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
	return tea.Batch(
		waitForEvent(m.events),
	)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		if msg.Width < 80 || msg.Height < 24 {
			return m, nil
		}
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
				selectedID := m.jobsTable.selectedID()
				if selectedID != m.outputVP.selectedID {
					m.outputVP.setSelected(selectedID)
				}
				return m, tea.Batch(cmds...)
			}
		case "down", "j":
			if m.focus == focusJobs {
				cmd := m.jobsTable.update(msg)
				cmds = append(cmds, cmd)
				selectedID := m.jobsTable.selectedID()
				if selectedID != m.outputVP.selectedID {
					m.outputVP.setSelected(selectedID)
				}
				return m, tea.Batch(cmds...)
			}
		}

		// Delegate to focused component
		if m.focus == focusJobs {
			cmd := m.jobsTable.update(msg)
			cmds = append(cmds, cmd)
		} else if m.focus == focusOutput {
			cmd := m.outputVP.update(msg)
			cmds = append(cmds, cmd)
		} else if m.focus == focusEvents {
			cmd := m.eventsList.update(msg)
			cmds = append(cmds, cmd)
		}
	}

	// Handle worker events
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
		status := "completed"
		level := "success"
		if !msg.success {
			status = "failed"
			level = "error"
		}
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Job %s %s", msg.id[:min(len(msg.id), 8)], status),
			level:     level,
			timestamp: msg.completedAt,
		})
	case jobOutputMsg:
		m.outputVP.appendLine(msg.id, msg.line)
	case activityMsg:
		m.eventsList.addEvent(activityEntry{
			text:      msg.text,
			level:     msg.level,
			timestamp: msg.timestamp,
		})
	case errorMsg:
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("[%s] %s", msg.source, msg.message),
			level:     "error",
			timestamp: msg.timestamp,
		})
	case metricsMsg:
		m.headerComp.update(msg)
	}

	// Schedule next event read
	cmds = append(cmds, waitForEvent(m.events))

	return m, tea.Batch(cmds...)
}

func (m *Model) resize() {
	if m.width == 0 || m.height == 0 {
		return
	}

	headerH := 3
	statusBarH := 1
	remaining := m.height - headerH - statusBarH - 4

	jobsH := remaining * 40 / 100
	bottomH := remaining - jobsH

	eventsW := m.width * 40 / 100
	outputW := m.width - eventsW - 4

	m.jobsTable.table.SetHeight(jobsH)
	m.jobsTable.table.SetWidth(m.width - 4)
	m.outputVP.setDimensions(outputW, bottomH)
	m.eventsList.setDimensions(eventsW, bottomH)
}

func (m Model) View() tea.View {
	if m.width == 0 {
		return tea.NewView("Initializing...")
	}
	if m.width < 80 || m.height < 24 {
		return tea.NewView(lipgloss.NewStyle().Foreground(ColorWarning).Render(
			fmt.Sprintf("Terminal too small (%dx%d). Minimum: 80x24", m.width, m.height),
		))
	}

	header := m.headerComp.View(m.width - 4)
	jobs := m.jobsTable.View(m.width - 4)

	output := m.outputVP.View()
	events := m.eventsList.View()

	eventsW := m.width * 40 / 100
	outputW := m.width - eventsW - 4

	bottom := lipgloss.JoinHorizontal(lipgloss.Top,
		panelStyle.Width(outputW).BorderTop(true).BorderLeft(true).BorderRight(false).BorderBottom(true).Render(output),
		panelStyle.Width(eventsW).BorderTop(true).BorderLeft(false).BorderRight(true).BorderBottom(true).Render(events),
	)

	statusBar := m.statusBar.View(m.width)

	return tea.NewView(lipgloss.JoinVertical(lipgloss.Left,
		panelStyle.Width(m.width).BorderTop(true).BorderLeft(true).BorderRight(true).BorderBottom(false).BorderForeground(ColorPrimary).Render(header),
		panelStyle.Width(m.width).BorderTop(true).BorderLeft(true).BorderRight(true).BorderBottom(false).Render(jobs),
		bottom,
		statusBar,
	))
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


