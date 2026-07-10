package tui

import "charm.land/lipgloss/v2"

var (
	ColorBG       = lipgloss.Color("#1a1b26")
	ColorText     = lipgloss.Color("#c0caf5")
	ColorGreen    = lipgloss.Color("#9ece6a")
	ColorRed      = lipgloss.Color("#f7768e")
	ColorYellow   = lipgloss.Color("#e0af68")
	ColorCyan     = lipgloss.Color("#7dcfff")
	ColorMagenta  = lipgloss.Color("#bb9af7")
	ColorBlue     = lipgloss.Color("#7aa2f7")
	ColorGray     = lipgloss.Color("#565f89")
	ColorSubtle   = lipgloss.Color("#24283b")
	ColorDarkGray = lipgloss.Color("#3b4261")
)

var (
	BorderNormal = lipgloss.NormalBorder()
	BorderRound  = lipgloss.RoundedBorder()
	BorderNone   = lipgloss.Border{}
)

// Panel styles
var panelStyle = lipgloss.NewStyle().
	BorderForeground(ColorDarkGray).
	Padding(0, 1)

// Header styles
var (
	headerTitleStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorCyan).
				MarginRight(1)

	headerConnectedStyle = lipgloss.NewStyle().
				Foreground(ColorGreen).
				Bold(true)

	headerDisconnectedStyle = lipgloss.NewStyle().
				Foreground(ColorRed).
				Bold(true)

	headerDetailStyle = lipgloss.NewStyle().
				Foreground(ColorGray)

	headerMetricLabel = lipgloss.NewStyle().
				Foreground(ColorGray)

	headerMetricValue = lipgloss.NewStyle().
				Foreground(ColorText).
				Bold(true)

	headerMetricHigh = lipgloss.NewStyle().
				Foreground(ColorRed).
				Bold(true)

	headerMetricMedium = lipgloss.NewStyle().
				Foreground(ColorYellow).
				Bold(true)

	headerBarFilled = lipgloss.NewStyle().
				Foreground(ColorCyan)

	headerBarEmpty = lipgloss.NewStyle().
				Foreground(ColorDarkGray)
)

// Table styles
var (
	tableHeaderStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorGray)

	tableRowStyle = lipgloss.NewStyle().
			Foreground(ColorText)

	tableSelectedStyle = lipgloss.NewStyle().
				Foreground(ColorText).
				Background(ColorBlue).
				Bold(true)

	tableRunningStyle = lipgloss.NewStyle().
				Foreground(ColorGreen)

	tableCompletedStyle = lipgloss.NewStyle().
				Foreground(ColorGreen)

	tableFailedStyle = lipgloss.NewStyle().
				Foreground(ColorRed)

	tableIdleStyle = lipgloss.NewStyle().
			Foreground(ColorGray)
)

// Output styles
var outputStyle = lipgloss.NewStyle().
	Foreground(ColorText)

// Event styles
var (
	eventTimestampStyle = lipgloss.NewStyle().
				Foreground(ColorGray)

	eventInfoStyle    = lipgloss.NewStyle().Foreground(ColorText)
	eventSuccessStyle = lipgloss.NewStyle().Foreground(ColorGreen)
	eventWarningStyle = lipgloss.NewStyle().Foreground(ColorYellow)
	eventErrorStyle   = lipgloss.NewStyle().Foreground(ColorRed)
)

// Status bar styles
var statusBarStyle = lipgloss.NewStyle().
	Background(ColorSubtle).
	Foreground(ColorText).
	Padding(0, 1)

var statusKeyStyle = lipgloss.NewStyle().
	Foreground(ColorCyan).
	Bold(true)

// Session-specific styles
var (
	sessionActiveStyle = lipgloss.NewStyle().
				Foreground(ColorGreen).
				Bold(true)

	sessionIdleStyle = lipgloss.NewStyle().
				Foreground(ColorGray)
)
