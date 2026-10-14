package tui

import (
	"strings"
	"testing"
	"time"

	"oasm-worker/internal/config"
	"oasm-worker/internal/worker"
)

// TestProgressModelRendersBarForActivePull: a live pull occupies one line and
// ends at the reported percentage; the section collapses when nothing pulls.
func TestProgressModelRendersBarForActivePull(t *testing.T) {
	m := newProgressModel()
	m.setWidth(40)
	if m.active() || m.height() != 0 {
		t.Fatal("a fresh model must render nothing")
	}

	m.update("job-1", "ghcr.io/oasm-platform/connector-nmap:7.97", 0.42, false)

	if !m.active() || m.height() != 1 {
		t.Fatalf("active=%t height=%d, want true/1", m.active(), m.height())
	}
	view := m.View()
	if !strings.Contains(view, "42%") {
		t.Fatalf("bar view missing percentage: %q", view)
	}
	if !strings.Contains(view, "connector-nmap:7.97") {
		t.Fatalf("bar view must label the image without its registry prefix: %q", view)
	}
}

// TestProgressModelSettlesThenPrunes: a finished pull stays visible for the
// settle TTL (so completion is seen) and then disappears on its own.
func TestProgressModelSettlesThenPrunes(t *testing.T) {
	m := newProgressModel()
	m.setWidth(40)
	m.update("job-1", "img:1", 0.5, false)
	m.update("job-1", "img:1", 1, true)

	if !strings.Contains(m.View(), "done") {
		t.Fatalf("settled pull must show completion: %q", m.View())
	}

	m.prune()
	if !m.active() {
		t.Fatal("settled pull must survive the first prune")
	}

	// Age the row past the TTL instead of sleeping.
	m.rows["job-1"].doneAt = time.Now().Add(-2 * pullSettledTTL)
	m.prune()
	if m.active() {
		t.Fatal("settled pull must be pruned after the TTL")
	}
}

// TestProgressModelKeepsFailedPullVisible: a failed pull must not vanish on the
// settle TTL — it is the evidence of which image failed.
func TestProgressModelKeepsFailedPullVisible(t *testing.T) {
	m := newProgressModel()
	m.setWidth(40)
	m.update("job-1", "img:1", 0.3, false)
	m.markFailed("job-1")
	m.rows["job-1"].doneAt = time.Now().Add(-10 * pullSettledTTL)

	m.prune()
	if !m.active() {
		t.Fatal("failed pull must survive pruning")
	}
}

// TestProgressModelDeduplicatesByJobAndCapsRows: progress ticks for one job
// update one row, and concurrent pulls beyond the cap aggregate into a counter
// instead of eating the whole screen.
func TestProgressModelDeduplicatesByJobAndCapsRows(t *testing.T) {
	m := newProgressModel()
	m.setWidth(40)

	m.update("job-1", "img:1", 0.1, false)
	m.update("job-1", "img:1", 0.9, false)
	if m.height() != 1 {
		t.Fatalf("height=%d, want 1 row for one job", m.height())
	}
	if !strings.Contains(m.View(), "90%") {
		t.Fatalf("row must reflect the latest tick: %q", m.View())
	}

	for _, id := range []string{"job-2", "job-3", "job-4", "job-5"} {
		m.update(id, "img:"+id, 0.2, false)
	}
	if got := m.height(); got != pullMaxRows+1 {
		t.Fatalf("height=%d, want capped at %d (+1 overflow line)", got, pullMaxRows+1)
	}
	if !strings.Contains(m.View(), "+2 more image pull(s)") {
		t.Fatalf("overflow line missing: %q", m.View())
	}
}

// TestProgressModelIgnoresLateTicksAfterDone: a straggler tick from the same
// job must not resurrect a settled row or restart its timer.
func TestProgressModelIgnoresLateTicksAfterDone(t *testing.T) {
	m := newProgressModel()
	m.setWidth(40)
	m.update("job-1", "img:1", 1, true)
	doneAt := m.rows["job-1"].doneAt

	m.update("job-1", "img:1", 0.1, false)
	if m.rows["job-1"].doneAt != doneAt {
		t.Fatal("late tick must not restart the settle timer")
	}
	if !strings.Contains(m.View(), "done") {
		t.Fatalf("late tick must not un-settle the row: %q", m.View())
	}
}

// TestModelShowsAndHidesPullSection: the layout gains the pull lines while a
// pull is running and gives them back afterwards, so no screen space is
// wasted at rest.
func TestModelShowsAndHidesPullSection(t *testing.T) {
	events := make(chan worker.TuiEvent, 8)
	m := NewModel(&config.Config{}, events)
	m.width, m.height = 120, 40
	m.resize()

	atRest := computeLayout(m.width, m.height, m.pulls.height())
	if atRest.progressLines != 0 {
		t.Fatalf("rest layout must not reserve pull lines, got %d", atRest.progressLines)
	}

	m2, _ := m.Update(imagePullMsg{id: "job-1", image: "img:1", pulled: 0.5})
	mm := m2.(Model)
	if got := mm.pulls.height(); got != 1 {
		t.Fatalf("pull section height=%d, want 1", got)
	}
	withPull := computeLayout(mm.width, mm.height, mm.pulls.height())
	if withPull.progressLines != 1 || withPull.bottomLines != atRest.bottomLines-1 {
		t.Fatalf("pull section must take one line from the bottom row: rest=%+v with=%+v", atRest, withPull)
	}
	if !strings.Contains(mm.View().Content, "50%") {
		t.Fatalf("view must render the pull bar: %q", mm.View().Content)
	}
}

// TestModelMarksPullFailedFromJobCompleted: a failed job keeps its pull row so
// the failing image stays identifiable.
func TestModelMarksPullFailedFromJobCompleted(t *testing.T) {
	events := make(chan worker.TuiEvent, 8)
	m := NewModel(&config.Config{}, events)
	m.width, m.height = 120, 40
	m.resize()

	m1, _ := m.Update(imagePullMsg{id: "job-1", image: "img:1", pulled: 0.2})
	m2, _ := m1.(Model).Update(jobCompletedMsg{id: "job-1", success: false, completedAt: time.Now()})
	if !m2.(Model).pulls.failed["job-1"] {
		t.Fatal("failed job must mark its pull as failed")
	}
}
