package tui

import (
	"time"

	"charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/table"
	"charm.land/lipgloss/v2"
)

type jobsModel struct {
	table table.Model
	jobs  []activeJob
}

func newJobsModel() jobsModel {
	columns := []table.Column{
		{Title: "ID", Width: 10},
		{Title: "Command", Width: 0},
		{Title: "Asset", Width: 20},
		{Title: "Status", Width: 12},
		{Title: "Duration", Width: 10},
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

	return jobsModel{table: t}
}

func (j *jobsModel) update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	j.table, cmd = j.table.Update(msg)
	return cmd
}

func (j *jobsModel) handleJobStarted(msg jobStartedMsg) {
	job := activeJob{
		id:        msg.id,
		command:   msg.command,
		assetVal:  msg.assetVal,
		startedAt: msg.startedAt,
	}
	j.jobs = append(j.jobs, job)
	j.refreshTable()
}

func (j *jobsModel) handleJobCompleted(msg jobCompletedMsg) {
	for i, job := range j.jobs {
		if job.id == msg.id {
			j.jobs = append(j.jobs[:i], j.jobs[i+1:]...)
			break
		}
	}
	j.refreshTable()
}

func (j *jobsModel) refreshTable() {
	rows := make([]table.Row, 0, len(j.jobs))
	for _, job := range j.jobs {
		cmd := truncate(job.command, 30)
		asset := truncate(job.assetVal, 18)
		elapsed := time.Since(job.startedAt)

		rows = append(rows, table.Row{
			job.id[:min(len(job.id), 8)],
			cmd,
			asset,
			"▶ running",
			formatDuration(elapsed),
		})
	}

	columns := j.table.Columns()
	totalFixed := 10 + 20 + 12 + 10 + 4
	cmdWidth := max(20, 60-totalFixed)
	columns[1] = table.Column{Title: "Command", Width: cmdWidth}
	j.table.SetColumns(columns)
	j.table.SetRows(rows)
}

func (j jobsModel) selectedID() string {
	selected := j.table.Cursor()
	if selected >= 0 && selected < len(j.jobs) {
		return j.jobs[selected].id
	}
	return ""
}

func (j jobsModel) View(width int) string {
	if len(j.jobs) == 0 {
		return lipgloss.NewStyle().Foreground(ColorMuted).Render("No active jobs")
	}
	return j.table.View()
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
