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
	focusSessions focusTarget = iota
	focusJobs
	focusOutput
	focusEvents
)

type layout struct {
	headerLines int
	gapLines    int
	topLines    int
	statusBar   int
	bottomLines int
	leftW       int
	rightW      int
}

func computeLayout(w, h int) layout {
	l := layout{
		headerLines: 3,
		gapLines:    1,
		topLines:    10,
		statusBar:   1,
	}
	l.bottomLines = h - l.headerLines - l.gapLines*2 - l.topLines - l.statusBar
	if l.bottomLines < 4 {
		l.bottomLines = 4
	}
	l.leftW = w * 55 / 100
	l.rightW = w - l.leftW
	return l
}

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

	headerComp    headerModel
	sessionsTable sessionsModel
	jobsTable     jobsModel
	outputVP      outputModel
	eventsList    eventsModel
	statusBar     statusBarModel
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
	m.sessionsTable = newSessionsModel()
	m.jobsTable = newJobsModel()
	m.outputVP = newOutputModel()
	m.eventsList = newEventsModel()
	m.statusBar = newStatusBarModel()

	return m
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(waitForEvent(m.events), collectSystemMetrics())
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.resize()

	case tea.KeyPressMsg:
		var handled bool
		switch msg.String() {
		case "esc", "ctrl+c":
			return m, tea.Quit
		case "tab":
			m.focus = (m.focus + 1) % 4
			m.statusBar.setFocus(m.focus)
		case "shift+tab":
			m.focus = (m.focus + 3) % 4
			m.statusBar.setFocus(m.focus)
		case "left":
			m.focus = (m.focus + 3) % 4
			m.statusBar.setFocus(m.focus)
		case "right":
			m.focus = (m.focus + 1) % 4
			m.statusBar.setFocus(m.focus)
		case "1":
			m.focus = focusSessions
			m.statusBar.setFocus(m.focus)
		case "2":
			m.focus = focusJobs
			m.statusBar.setFocus(m.focus)
		case "up", "k":
			handled = true
			if m.focus == focusSessions {
				cmd := m.sessionsTable.update(msg)
				cmds = append(cmds, cmd)
				if id := m.sessionsTable.selectedID(); id != m.outputVP.selectedID {
					m.outputVP.setSelected(id)
				}
			} else if m.focus == focusJobs {
				cmd := m.jobsTable.update(msg)
				cmds = append(cmds, cmd)
				if id := m.jobsTable.selectedID(); id != m.outputVP.selectedID {
					m.outputVP.setSelected(id)
				}
			}
		case "down", "j":
			handled = true
			if m.focus == focusSessions {
				cmd := m.sessionsTable.update(msg)
				cmds = append(cmds, cmd)
				if id := m.sessionsTable.selectedID(); id != m.outputVP.selectedID {
					m.outputVP.setSelected(id)
				}
			} else if m.focus == focusJobs {
				cmd := m.jobsTable.update(msg)
				cmds = append(cmds, cmd)
				if id := m.jobsTable.selectedID(); id != m.outputVP.selectedID {
					m.outputVP.setSelected(id)
				}
			}
		}

		if !handled {
			if m.focus == focusSessions {
				cmds = append(cmds, m.sessionsTable.update(msg))
			} else if m.focus == focusJobs {
				cmds = append(cmds, m.jobsTable.update(msg))
			} else if m.focus == focusOutput {
				cmds = append(cmds, m.outputVP.update(msg))
			} else if m.focus == focusEvents {
				cmds = append(cmds, m.eventsList.update(msg))
			}
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
	case sessionCreatedMsg:
		m.sessionsTable.handleSessionCreated(msg)
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Session %s created", msg.id[:min(len(msg.id), 8)]),
			level:     "info",
			timestamp: msg.createdAt,
		})
		if len(m.sessionsTable.sessions) == 1 {
			m.outputVP.setSelected(msg.id)
		}
	case sessionCommandMsg:
		m.sessionsTable.handleSessionCommand(msg)
		m.outputVP.appendLine(msg.id, "")
		m.outputVP.appendLine(msg.id, fmt.Sprintf("$ %s", msg.command))
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Session %s executing command", msg.id[:min(len(msg.id), 8)]),
			level:     "info",
			timestamp: time.Now(),
		})
	case sessionClosedMsg:
		m.sessionsTable.handleSessionClosed(msg)
		m.eventsList.addEvent(activityEntry{
			text:      fmt.Sprintf("Session %s closed", msg.id[:min(len(msg.id), 8)]),
			level:     "warning",
			timestamp: time.Now(),
		})
	case sessionOutputMsg:
		m.outputVP.appendLine(msg.id, msg.line)
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
	case systemMetricsMsg:
		m.headerComp.update(msg)
		cmds = append(cmds, collectSystemMetrics())
	}

	cmds = append(cmds, waitForEvent(m.events))
	return m, tea.Batch(cmds...)
}

func (m *Model) resize() {
	if m.width == 0 || m.height == 0 {
		return
	}

	l := computeLayout(m.width, m.height)

	m.sessionsTable.table.SetHeight(l.topLines - 2)
	m.sessionsTable.table.SetWidth(l.leftW - 4)
	m.jobsTable.table.SetHeight(l.topLines - 2)
	m.jobsTable.table.SetWidth(l.rightW - 4)
	m.jobsTable.tableWidth = l.rightW
	m.outputVP.setDimensions(l.leftW-2, l.bottomLines-2)
	m.eventsList.setDimensions(l.rightW-2, l.bottomLines-2)
}

func (m Model) View() tea.View {
	if m.width == 0 || m.height == 0 {
		return tea.NewView("Initializing...")
	}
	if m.width < 80 || m.height < 20 {
		return tea.NewView(fmt.Sprintf("Terminal too small (%dx%d). Need 80x20.", m.width, m.height))
	}

	l := computeLayout(m.width, m.height)

	// Border helper
	bordered := func(content string, w, h int) string {
		return lipgloss.NewStyle().
			Width(w).
			Height(h).
			Border(lipgloss.NormalBorder()).
			BorderForeground(ColorDarkGray).
			Render(content)
	}

	// Header
	header := bordered(m.headerComp.View(m.width-4), m.width, l.headerLines)

	// Top row: sessions (left) + jobs (right)
	sessions := bordered(m.sessionsTable.View(), l.leftW, l.topLines)
	jobs := bordered(m.jobsTable.View(l.rightW), l.rightW, l.topLines)
	top := lipgloss.JoinHorizontal(lipgloss.Top, sessions, jobs)

	// Bottom row: output (left) + events (right)
	output := bordered(m.outputVP.View(), l.leftW, l.bottomLines)
	events := bordered(m.eventsList.View(), l.rightW, l.bottomLines)
	bottom := lipgloss.JoinHorizontal(lipgloss.Top, output, events)

	// Status bar
	statusBar := m.statusBar.View(m.width)

	// Assemble
	return tea.NewView(strings.Join([]string{
		header,
		top,
		bottom,
		statusBar,
	}, "\n"))
}

func waitForEvent(events <-chan worker.TuiEvent) tea.Cmd {
	return func() tea.Msg {
		event, ok := <-events
		if !ok {
			return tea.QuitMsg{}
		}
		return eventToMsg(event)
	}
}

func collectSystemMetrics() tea.Cmd {
	return tea.Tick(2*time.Second, func(t time.Time) tea.Msg {
		metrics := GetSystemMetrics()
		return systemMetricsMsg{
			cpuUsage:    metrics.CPUUsage,
			memoryUsed:  metrics.MemoryUsed,
			memoryTotal: metrics.MemoryTotal,
			memoryPct:   metrics.MemoryPct,
			goRoutines:  metrics.GoRoutines,
			heapAlloc:   metrics.HeapAlloc,
		}
	})
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
	case worker.EventSessionCreated:
		return sessionCreatedMsg{id: event.SessionID, createdAt: event.Timestamp}
	case worker.EventSessionCommand:
		return sessionCommandMsg{id: event.SessionID, cmdNum: event.SessionCmdCount, command: event.SessionCommand}
	case worker.EventSessionClosed:
		return sessionClosedMsg{id: event.SessionID}
	case worker.EventSessionOutput:
		return sessionOutputMsg{id: event.SessionID, line: event.SessionOutput, stream: event.SessionStream}
	}
	return nil
}
