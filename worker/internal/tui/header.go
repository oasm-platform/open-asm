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

	return lipgloss.JoinVertical(lipgloss.Left, line1, connDetail)
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
