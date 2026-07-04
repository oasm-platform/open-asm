package tui

import "charm.land/lipgloss/v2"

var (
	ColorPrimary = lipgloss.Color("#7C3AED")
	ColorSuccess = lipgloss.Color("#22C55E")
	ColorError   = lipgloss.Color("#EF4444")
	ColorWarning = lipgloss.Color("#EAB308")
	ColorInfo    = lipgloss.Color("#6B7280")
	ColorMuted   = lipgloss.Color("#4B5563")
	ColorText    = lipgloss.Color("#F9FAFB")
	ColorSubtle  = lipgloss.Color("#374151")
)

var (
	BorderNormal = lipgloss.NormalBorder()
	BorderRound  = lipgloss.RoundedBorder()
	BorderNone   = lipgloss.Border{}
)

var panelStyle = lipgloss.NewStyle().
	BorderForeground(ColorSubtle).
	Padding(0, 1)

var (
	headerTitleStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorPrimary).
				MarginRight(2)

	headerConnectedStyle = lipgloss.NewStyle().
				Foreground(ColorSuccess).
				Bold(true)

	headerDisconnectedStyle = lipgloss.NewStyle().
				Foreground(ColorError).
				Bold(true)

	headerDetailStyle = lipgloss.NewStyle().
				Foreground(ColorMuted)
)

var (
	tableHeaderStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorMuted)

	tableRowStyle = lipgloss.NewStyle().
			Foreground(ColorText)

	tableSelectedStyle = lipgloss.NewStyle().
				Foreground(ColorText).
				Background(ColorPrimary).
				Bold(true)

	tableRunningStyle = lipgloss.NewStyle().
				Foreground(ColorSuccess)

	tableCompletedStyle = lipgloss.NewStyle().
				Foreground(ColorSuccess)

	tableFailedStyle = lipgloss.NewStyle().
				Foreground(ColorError)
)

var outputStyle = lipgloss.NewStyle().
	Foreground(ColorText)

var (
	eventTimestampStyle = lipgloss.NewStyle().
				Foreground(ColorMuted)

	eventInfoStyle    = lipgloss.NewStyle().Foreground(ColorText)
	eventSuccessStyle = lipgloss.NewStyle().Foreground(ColorSuccess)
	eventWarningStyle = lipgloss.NewStyle().Foreground(ColorWarning)
	eventErrorStyle   = lipgloss.NewStyle().Foreground(ColorError)
)

var statusBarStyle = lipgloss.NewStyle().
	Background(ColorSubtle).
	Foreground(ColorText).
	Padding(0, 1)

var statusKeyStyle = lipgloss.NewStyle().
	Foreground(ColorPrimary).
	Bold(true)
