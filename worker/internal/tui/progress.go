package tui

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"charm.land/bubbles/v2/progress"
	"charm.land/lipgloss/v2"
)

const (
	// pullSettledTTL keeps a finished pull's bar on screen briefly so an
	// operator sees it complete instead of vanishing mid-frame.
	pullSettledTTL = 3 * time.Second
	// pullMaxRows caps how many concurrent pulls get a bar; a worker pulling
	// more images than this at once is already past the point where a bar
	// helps, and the section would eat the events feed.
	pullMaxRows = 3
	// Bar geometry: total width includes the label and the percentage.
	pullBarWidth   = 28
	pullLabelWidth = 30
)

// pullRow is one image pull being tracked: the fraction downloaded, when the
// pull finished, and a sequence number that fixes the row order (pull start
// order, so bars never swap places while bytes are arriving).
type pullRow struct {
	image    string
	fraction float64
	seq      int64
	doneAt   time.Time
}

// progressModel renders the image-pull progress bars shown above the activity
// feed. It exists because pull progress is high-volume and transient: as an
// activity log line it would be either spam or invisible.
type progressModel struct {
	rows map[string]*pullRow // key: job id (one pull per job)
	seq  int64
	bar  progress.Model
	// failed marks pulls that ended with an error, so the row is not hidden
	// after the settle TTL — the operator needs to see which image failed.
	failed map[string]bool
}

func newProgressModel() progressModel {
	return progressModel{
		rows:   map[string]*pullRow{},
		failed: map[string]bool{},
		bar: progress.New(
			progress.WithWidth(pullBarWidth),
			progress.WithColors(ColorCyan),
			// Half-block fill has no meaning without colour; the block
			// characters stay legible in a monochrome terminal.
			progress.WithFillCharacters(progress.DefaultFullCharFullBlock, progress.DefaultEmptyCharBlock),
			progress.WithSpringOptions(12, 1),
		),
	}
}

// update records a progress tick. A terminal tick (done) starts the settle
// timer instead of removing the row, so the bar is seen reaching 100%.
func (m *progressModel) update(jobID, image string, pulled float64, done bool) {
	if jobID == "" {
		return
	}
	row, ok := m.rows[jobID]
	if !ok {
		m.seq++
		row = &pullRow{image: image, seq: m.seq}
		m.rows[jobID] = row
	}
	// Guard against a late tick from a previous pull of the same job id.
	if done && !row.doneAt.IsZero() {
		return
	}
	if pulled >= 0 {
		row.fraction = pulled
	}
	if done {
		row.doneAt = time.Now()
	}
}

// markFailed flags a job's pull as failed so its row survives the settle TTL.
func (m *progressModel) markFailed(jobID string) {
	if row, ok := m.rows[jobID]; ok {
		m.failed[jobID] = true
		row.doneAt = time.Now()
	}
}

// prune drops rows that have been settled for longer than the TTL. Called on
// every tick so the section disappears on its own without a separate timer.
func (m *progressModel) prune() {
	now := time.Now()
	for id, row := range m.rows {
		if row.doneAt.IsZero() || m.failed[id] {
			continue
		}
		if now.Sub(row.doneAt) > pullSettledTTL {
			delete(m.rows, id)
		}
	}
}

// setWidth resizes the bar to fill the panel. Labels are fixed-width so the
// percentage column stays aligned across rows.
func (m *progressModel) setWidth(w int) {
	if w < 20 {
		w = 20
	}
	m.bar.SetWidth(w)
}

// height is the number of lines View will produce (0 hides the section).
func (m progressModel) height() int {
	n := 0
	for range m.rows {
		n++
	}
	if n > pullMaxRows {
		return pullMaxRows + 1
	}
	return n
}

func (m progressModel) active() bool { return len(m.rows) > 0 }

// View renders one bar per pull, oldest first.
func (m progressModel) View() string {
	if len(m.rows) == 0 {
		return ""
	}
	rows := make([]*pullRow, 0, len(m.rows))
	for _, r := range m.rows {
		rows = append(rows, r)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].seq < rows[j].seq })

	if len(rows) > pullMaxRows {
		rows = rows[:pullMaxRows]
	}

	label := lipgloss.NewStyle().Foreground(ColorText).Width(pullLabelWidth)
	dim := lipgloss.NewStyle().Foreground(ColorGray)

	lines := make([]string, 0, len(rows))
	for _, r := range rows {
		name := r.image
		if i := strings.LastIndex(name, "/"); i >= 0 {
			name = name[i+1:]
		}
		if len(name) > pullLabelWidth-2 {
			name = name[:pullLabelWidth-3] + "…"
		}

		// A settled pull shows a full bar plus "done"; one still running shows
		// its live percentage.
		pct := r.fraction
		suffix := fmt.Sprintf("%3.0f%%", pct*100)
		if !r.doneAt.IsZero() {
			pct = 1
			suffix = "done"
		}
		lines = append(lines, fmt.Sprintf("%s %s %s",
			label.Render(name),
			barAt(m.bar, pct),
			dim.Render(suffix),
		))
	}

	total := 0
	for range m.rows {
		total++
	}
	if total > pullMaxRows {
		lines = append(lines, dim.Render(fmt.Sprintf("  +%d more image pull(s)", total-pullMaxRows)))
	}
	return strings.Join(lines, "\n")
}

// barAt renders the shared bar template at a fixed percentage.
func barAt(bar progress.Model, pct float64) string {
	if pct < 0 {
		pct = 0
	}
	if pct > 1 {
		pct = 1
	}
	return bar.ViewAs(pct)
}
