package tui

import "strings"

type statusBarModel struct {
	focus focusTarget
}

func newStatusBarModel() statusBarModel {
	return statusBarModel{}
}

func (s *statusBarModel) setFocus(f focusTarget) {
	s.focus = f
}

func (s statusBarModel) View(width int) string {
	panel := ""
	switch s.focus {
	case focusSessions:
		panel = statusKeyStyle.Render("[1]●Sessions") + " [2] Jobs"
	case focusJobs:
		panel = "[1] Sessions " + statusKeyStyle.Render("[2]●Jobs")
	case focusOutput:
		panel = "[1] Sessions [2] Jobs " + statusKeyStyle.Render("●Output")
	case focusEvents:
		panel = "[1] Sessions [2] Jobs " + statusKeyStyle.Render("●Events")
	}

	left := panel

	right := statusKeyStyle.Render("[TAB]") + " Switch  " +
		statusKeyStyle.Render("[↑↓]") + " Navigate  " +
		statusKeyStyle.Render("[ESC]") + " Quit"

	gap := width - len(left) - len(right) - 4
	if gap < 0 {
		gap = 0
	}
	bar := left + strings.Repeat(" ", gap) + right

	return statusBarStyle.
		Width(width).
		Render(bar)
}
