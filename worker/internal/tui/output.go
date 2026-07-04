package tui

import (
	"strings"

	"charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/viewport"
	"charm.land/lipgloss/v2"
)

type outputModel struct {
	viewport   viewport.Model
	lines      map[string][]string
	selectedID string
	autoScroll bool
	width      int
	height     int
}

func newOutputModel() outputModel {
	vp := viewport.New(
		viewport.WithWidth(60),
		viewport.WithHeight(10),
	)

	return outputModel{
		viewport:   vp,
		lines:      make(map[string][]string),
		autoScroll: true,
	}
}

func (o *outputModel) update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	o.viewport, cmd = o.viewport.Update(msg)
	return cmd
}

func (o *outputModel) setSelected(jobID string) {
	o.selectedID = jobID
	o.refreshContent()
}

func (o *outputModel) appendLine(jobID, line string) {
	o.lines[jobID] = append(o.lines[jobID], line)
	if jobID == o.selectedID {
		o.refreshContent()
	}
}

func (o *outputModel) refreshContent() {
	lines := o.lines[o.selectedID]
	content := strings.Join(lines, "\n")
	o.viewport.SetContent(content)

	if o.autoScroll {
		o.viewport.GotoBottom()
	}
}

func (o *outputModel) setDimensions(width, height int) {
	o.width = width
	o.height = height
	o.viewport.SetWidth(width)
	o.viewport.SetHeight(height)
}

func (o outputModel) View() string {
	if o.selectedID == "" {
		return lipgloss.NewStyle().Foreground(ColorMuted).Render("Select a job to view output")
	}
	return o.viewport.View()
}
