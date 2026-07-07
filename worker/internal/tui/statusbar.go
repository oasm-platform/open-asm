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
	left := statusKeyStyle.Render("[F1]") + " Help  " +
		statusKeyStyle.Render("[F2]") + " Settings  " +
		statusKeyStyle.Render("[F3]") + " Job List  " +
		statusKeyStyle.Render("[F4]") + " Log View"

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
