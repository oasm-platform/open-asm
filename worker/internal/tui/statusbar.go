package tui

import (
	"fmt"
	"strings"
)

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
	panelNames := []string{"Jobs", "Output", "Events"}
	focusIdx := int(s.focus)

	var hints []string
	for i, name := range panelNames {
		if i == focusIdx {
			hints = append(hints, statusKeyStyle.Render(fmt.Sprintf("[%s]", name)))
		} else {
			hints = append(hints, name)
		}
	}

	left := strings.Join(hints, "  ")
	right := statusKeyStyle.Render("tab") + " switch  " +
		statusKeyStyle.Render("↑↓") + " navigate  " +
		statusKeyStyle.Render("q") + " quit"

	gap := width - len(left) - len(right) - 4
	if gap < 0 {
		gap = 0
	}
	bar := left + strings.Repeat(" ", gap) + right

	return statusBarStyle.
		Width(width).
		Render(bar)
}
