package tui

import (
	"fmt"
	"time"

	"charm.land/bubbles/v2/table"
	"charm.land/bubbletea/v2"
)

type activeSession struct {
	id           string
	commandCount int
	createdAt    time.Time
	active       bool
}

type sessionsModel struct {
	table    table.Model
	sessions []activeSession
}

func newSessionsModel() sessionsModel {
	columns := []table.Column{
		{Title: "ID", Width: 10},
		{Title: "Cmds", Width: 6},
		{Title: "Created", Width: 10},
		{Title: "Status", Width: 12},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithHeight(8),
		table.WithFocused(true),
	)

	s := table.DefaultStyles()
	s.Header = tableHeaderStyle
	s.Cell = tableRowStyle
	s.Selected = tableSelectedStyle
	t.SetStyles(s)

	return sessionsModel{table: t}
}

func (s *sessionsModel) update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	s.table, cmd = s.table.Update(msg)
	return cmd
}

func (s *sessionsModel) handleSessionCreated(msg sessionCreatedMsg) {
	session := activeSession{
		id:           msg.id,
		commandCount: 0,
		createdAt:    msg.createdAt,
		active:       true,
	}
	s.sessions = append(s.sessions, session)
	s.refreshTable()
}

func (s *sessionsModel) handleSessionCommand(msg sessionCommandMsg) {
	for i := range s.sessions {
		if s.sessions[i].id == msg.id {
			s.sessions[i].commandCount++
			break
		}
	}
	s.refreshTable()
}

func (s *sessionsModel) handleSessionClosed(msg sessionClosedMsg) {
	for i := range s.sessions {
		if s.sessions[i].id == msg.id {
			s.sessions = append(s.sessions[:i], s.sessions[i+1:]...)
			break
		}
	}
	s.refreshTable()
}

func (s *sessionsModel) refreshTable() {
	rows := make([]table.Row, 0, len(s.sessions))
	for _, sess := range s.sessions {
		id := sess.id
		if len(id) > 8 {
			id = id[:8]
		}

		status := "○ idle"
		if sess.active {
			status = "● active"
		}

		rows = append(rows, table.Row{
			id,
			fmt.Sprintf("%d", sess.commandCount),
			sess.createdAt.Format("15:04:05"),
			status,
		})
	}

	s.table.SetRows(rows)
}

func (s sessionsModel) selectedID() string {
	selected := s.table.Cursor()
	if selected >= 0 && selected < len(s.sessions) {
		return s.sessions[selected].id
	}
	return ""
}

func (s sessionsModel) View() string {
	if len(s.sessions) == 0 {
		return "No active sessions"
	}
	return s.table.View()
}
