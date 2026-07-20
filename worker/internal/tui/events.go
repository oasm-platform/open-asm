package tui

import (
	"fmt"
	"strings"

	"charm.land/bubbles/v2/viewport"
	"charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

const maxEvents = 200

type eventsModel struct {
	viewport   viewport.Model
	activities []activityEntry
	width      int
	height     int
}

func newEventsModel() eventsModel {
	vp := viewport.New(
		viewport.WithWidth(30),
		viewport.WithHeight(10),
	)

	return eventsModel{
		viewport: vp,
	}
}

func (e *eventsModel) update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	e.viewport, cmd = e.viewport.Update(msg)
	return cmd
}

func (e *eventsModel) addEvent(entry activityEntry) {
	e.activities = append(e.activities, entry)
	if len(e.activities) > maxEvents {
		e.activities = e.activities[len(e.activities)-maxEvents:]
	}
	e.refreshContent()
}

func (e *eventsModel) refreshContent() {
	var sb strings.Builder
	for _, entry := range e.activities {
		ts := eventTimestampStyle.Render(entry.timestamp.Format("15:04:05"))

		var levelIcon string
		var style lipgloss.Style
		switch entry.level {
		case "success":
			levelIcon = "✓"
			style = eventSuccessStyle
		case "warning":
			levelIcon = "⚠"
			style = eventWarningStyle
		case "error":
			levelIcon = "✗"
			style = eventErrorStyle
		default:
			levelIcon = "●"
			style = eventInfoStyle
		}

		icon := style.Render(levelIcon)
		sb.WriteString(fmt.Sprintf("%s %s %s\n", ts, icon, entry.text))
	}

	e.viewport.SetContent(sb.String())
	e.viewport.GotoBottom()
}

func (e *eventsModel) setDimensions(width, height int) {
	e.width = width
	e.height = height
	e.viewport.SetWidth(width)
	e.viewport.SetHeight(height)
}

func (e eventsModel) View() string {
	return e.viewport.View()
}
