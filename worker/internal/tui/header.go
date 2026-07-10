package tui

import (
	"fmt"
	"time"

	"charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type headerModel struct {
	connected   bool
	workerID    string
	host        string
	port        int
	connectedAt time.Time
	duration    time.Duration
	activeJobs  int
	maxSlots    int

	// System metrics
	cpuUsage    float64
	memoryUsed  uint64
	memoryTotal uint64
	memoryPct   float64
	goRoutines  int
	heapAlloc   uint64
}

func newHeaderModel() headerModel {
	return headerModel{}
}

func (h *headerModel) update(msg tea.Msg) {
	switch msg := msg.(type) {
	case connectMsg:
		h.connected = true
		h.workerID = msg.workerID
		h.host = msg.host
		h.port = msg.port
		h.connectedAt = msg.connectedAt
	case disconnectMsg:
		h.connected = false
	case metricsMsg:
		h.activeJobs = msg.activeJobs
		h.maxSlots = msg.maxConcurrency
	case systemMetricsMsg:
		h.cpuUsage = msg.cpuUsage
		h.memoryUsed = msg.memoryUsed
		h.memoryTotal = msg.memoryTotal
		h.memoryPct = msg.memoryPct
		h.goRoutines = msg.goRoutines
		h.heapAlloc = msg.heapAlloc
	case tickMsg:
		if h.connected {
			h.duration = time.Since(h.connectedAt)
		}
	}
}

func (h headerModel) View(width int) string {
	if width < 40 {
		return h.renderCompact()
	}
	return h.renderFull(width)
}

func (h headerModel) renderCompact() string {
	status := headerDisconnectedStyle.Render("○ Disconnected")
	if h.connected {
		status = headerConnectedStyle.Render("● Connected")
	}

	title := headerTitleStyle.Render("OASM Agent")
	return fmt.Sprintf("%s  %s", title, status)
}

func (h headerModel) renderFull(width int) string {
	status := headerDisconnectedStyle.Render("○ Disconnected")
	if h.connected {
		status = headerConnectedStyle.Render("● Connected")
	}

	title := headerTitleStyle.Render("OASM Agent")
	workerIDShort := h.workerID
	if len(workerIDShort) > 8 {
		workerIDShort = workerIDShort[:8]
	}
	line1 := fmt.Sprintf("%s  Worker: %s  %s", title, workerIDShort, status)

	connDetail := ""
	if h.connected {
		connDetail = headerDetailStyle.Render(
			fmt.Sprintf("gRPC: %s:%d   Uptime: %s   Slots: %d/%d",
				h.host, h.port, formatDuration(h.duration), h.activeJobs, h.maxSlots,
			),
		)
	}

	// System metrics line
	sysMetrics := h.renderSystemMetrics()

	return lipgloss.JoinVertical(lipgloss.Left, line1, connDetail, sysMetrics)
}

func renderBar(percent float64, width int) string {
	filled := int(percent / 100 * float64(width))
	empty := width - filled

	bar := ""
	for i := 0; i < filled; i++ {
		bar += headerBarFilled.Render("█")
	}
	for i := 0; i < empty; i++ {
		bar += headerBarEmpty.Render("░")
	}
	return bar
}

func (h headerModel) renderSystemMetrics() string {
	if h.memoryTotal == 0 {
		return ""
	}

	cpuStyle := headerMetricValue
	if h.cpuUsage > 80 {
		cpuStyle = headerMetricHigh
	} else if h.cpuUsage > 50 {
		cpuStyle = headerMetricMedium
	}

	memStyle := headerMetricValue
	if h.memoryPct > 80 {
		memStyle = headerMetricHigh
	} else if h.memoryPct > 50 {
		memStyle = headerMetricMedium
	}

	cpuBar := renderBar(h.cpuUsage, 10)
	memBar := renderBar(h.memoryPct, 10)

	cpuStr := headerMetricLabel.Render("CPU: ") + cpuBar + " " + cpuStyle.Render(fmt.Sprintf("%.1f%%", h.cpuUsage))
	memStr := headerMetricLabel.Render("MEM: ") + memBar + " " + memStyle.Render(fmt.Sprintf("%.1f%%", h.memoryPct))
	memDetail := headerMetricLabel.Render(fmt.Sprintf(" (%s/%s)", formatBytes(h.memoryUsed), formatBytes(h.memoryTotal)))
	goroutines := headerMetricLabel.Render(fmt.Sprintf("  Go: %d", h.goRoutines))
	heap := headerMetricLabel.Render(fmt.Sprintf("  Heap: %s", formatBytes(h.heapAlloc)))

	return cpuStr + "  " + memStr + memDetail + goroutines + heap
}

func formatBytes(bytes uint64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)
	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.1fGB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.1fMB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.1fKB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%dB", bytes)
	}
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm %ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%dh %dm", int(d.Hours()), int(d.Minutes())%60)
}
