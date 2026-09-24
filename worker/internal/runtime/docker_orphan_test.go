package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/docker/docker/api/types"
)

// managed builds a seeded engine-list entry the way DockerRuntime.Create
// stamps containers: oasm-managed always, oasm.worker_id only when the
// owner is known.
func managed(id, state, owner string) types.Container {
	labels := map[string]string{"oasm-managed": "true"}
	if owner != "" {
		labels["oasm.worker_id"] = owner
	}
	return types.Container{ID: id, State: state, Labels: labels}
}

// applyLabelFilter mimics the daemon's `label` filter over the seeded list,
// so tests fail when production forgets to send the oasm-managed filter.
// The Docker SDK encodes filters as a set — {"label":{"k=v":true}}
// (json.Marshal of map[string]map[string]bool); the daemon also accepts the
// legacy list form {"label":["k=v"]}. Parse whichever arrives; unparseable
// input fails open (no filtering), matching the daemon's permissive stance
// only for genuinely malformed input — which the SDK never sends.
func applyLabelFilter(items []types.Container, raw string) []types.Container {
	if raw == "" {
		return items
	}
	var exprs []string
	var set map[string]map[string]bool
	var list map[string][]string
	switch {
	case json.Unmarshal([]byte(raw), &set) == nil:
		for v := range set["label"] {
			exprs = append(exprs, v)
		}
	case json.Unmarshal([]byte(raw), &list) == nil:
		exprs = list["label"]
	default:
		return items
	}
	out := make([]types.Container, 0, len(items))
	for _, it := range items {
		if matchLabelExprs(it.Labels, exprs) {
			out = append(out, it)
		}
	}
	return out
}

// matchLabelExprs: expressions within one filter key are OR'ed (daemon
// semantics); "k=v" requires equality, bare "k" requires presence.
func matchLabelExprs(labels map[string]string, exprs []string) bool {
	if len(exprs) == 0 {
		return true
	}
	for _, expr := range exprs {
		k, v, hasV := strings.Cut(expr, "=")
		got, present := labels[k]
		if present && (!hasV || got == v) {
			return true
		}
	}
	return false
}

func TestCreateStampsWorkerIDLabel(t *testing.T) {
	engine := newFakeDockerEngine()
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	_, err := r.Create(context.Background(), JobSpec{
		Tool:     "nuclei",
		Image:    "ghcr.io/open-asm/nuclei:1.0",
		WorkerID: "owner-abc",
	}, RuntimeOpts{})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if got := engine.labels["oasm.worker_id"]; got != "owner-abc" {
		t.Fatalf("container label oasm.worker_id = %q, want %q", got, "owner-abc")
	}
}

func TestCreateOmitsEmptyWorkerIDLabel(t *testing.T) {
	engine := newFakeDockerEngine()
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:  "nuclei",
		Image: "ghcr.io/open-asm/nuclei:1.0",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if _, ok := engine.labels["oasm.worker_id"]; ok {
		t.Fatal("oasm.worker_id label must be omitted when WorkerID is empty (unknown owner must not look like ours)")
	}
}

// Tier 1: terminal containers are dead weight regardless of owner — a dead
// container serves nobody. This is the main orphan class after a crash (the
// SDK exits once its stream dies).
func TestReconcileRemovesStoppedManaged(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.list = []types.Container{
		managed("exited-1", "exited", "other-owner"),
		managed("exited-2", "exited", ""), // legacy container without owner label
	}
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	rep := r.ReconcileOrphans(context.Background(), "mine")

	if rep.StoppedRemoved != 2 || rep.OwnRunningRemoved != 0 || rep.SkippedForeign != 0 || rep.Failed != 0 {
		t.Fatalf("report = %+v, want StoppedRemoved=2 and nothing else", rep)
	}
	if engine.removed != 2 {
		t.Fatalf("engine removals = %d, want 2", engine.removed)
	}
	if len(engine.removeIDs) != 2 || engine.removeIDs[0] != "exited-1" || engine.removeIDs[1] != "exited-2" {
		t.Fatalf("removed IDs = %v, want [exited-1 exited-2]", engine.removeIDs)
	}
}

// Tier 2: a RUNNING container stamped with OUR owner is an orphan of this
// very process identity — a fresh boot holds no stream/exec tokens for it,
// so adoption is impossible and it must be force-removed.
func TestReconcileRemovesOwnRunningOrphan(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.list = []types.Container{
		managed("own-1", "running", "mine"),
	}
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	rep := r.ReconcileOrphans(context.Background(), "mine")

	if rep.OwnRunningRemoved != 1 || rep.StoppedRemoved != 0 || rep.SkippedForeign != 0 || rep.Failed != 0 {
		t.Fatalf("report = %+v, want OwnRunningRemoved=1 and nothing else", rep)
	}
	if len(engine.removeIDs) != 1 || engine.removeIDs[0] != "own-1" {
		t.Fatalf("removed IDs = %v, want [own-1]", engine.removeIDs)
	}
}

// Tier 3 — the safety invariant: on a shared docker.sock a RUNNING container
// owned by someone else (or by no one we recognize) may be a live sibling
// worker's warm container. Never touch it.
func TestReconcileKeepsForeignRunning(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.list = []types.Container{
		managed("sib-1", "running", "other-worker"),
		managed("sib-2", "running", ""), // running, owner unknown → not provably ours
		{ID: "unmanaged-1", State: "running", Labels: map[string]string{"app": "redis"}},
	}
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	rep := r.ReconcileOrphans(context.Background(), "mine")

	if engine.removed != 0 {
		t.Fatalf("foreign/unmanaged running containers must be kept, engine removals = %d (IDs %v)", engine.removed, engine.removeIDs)
	}
	if rep.SkippedForeign != 2 || rep.OwnRunningRemoved != 0 || rep.StoppedRemoved != 0 {
		t.Fatalf("report = %+v, want SkippedForeign=2 (unmanaged filtered daemon-side)", rep)
	}
}

// Empty owner (first-ever boot: no signature, no token) degrades to tier 1
// only — without ownership proof, nothing running may be deleted.
func TestReconcileEmptyOwnerOnlyRemovesStopped(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.list = []types.Container{
		managed("run-1", "running", "anyone"),
		managed("exit-1", "exited", "anyone"),
	}
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	rep := r.ReconcileOrphans(context.Background(), "")

	if rep.StoppedRemoved != 1 || rep.OwnRunningRemoved != 0 || rep.SkippedForeign != 1 {
		t.Fatalf("report = %+v, want StoppedRemoved=1 SkippedForeign=1", rep)
	}
	if len(engine.removeIDs) != 1 || engine.removeIDs[0] != "exit-1" {
		t.Fatalf("removed IDs = %v, want only [exit-1]", engine.removeIDs)
	}
}

// Reconcile is best-effort: a failing removal is logged and counted, and the
// pass must continue with the remaining containers.
func TestReconcileContinuesAfterRemoveError(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.removeErr = errors.New("engine says no")
	engine.list = []types.Container{
		managed("a-1", "exited", "x"),
		managed("b-1", "exited", "y"),
	}
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	rep := r.ReconcileOrphans(context.Background(), "mine")

	if rep.Failed != 2 || rep.StoppedRemoved != 0 {
		t.Fatalf("report = %+v, want Failed=2", rep)
	}
	if engine.removed != 2 {
		t.Fatalf("removal attempts = %d, want 2 (pass must continue past failures)", engine.removed)
	}
	if _, ok := log.find("orphan reconcile: remove"); !ok {
		t.Fatalf("expected a remove-failure warning, got logs: %v", log.all())
	}
}

// The list call must carry the oasm-managed filter — the pass is scoped to
// our containers, never a full-engine sweep.
func TestReconcileListsManagedOnly(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.list = []types.Container{managed("exited-1", "exited", "x")}
	r := newFakeDockerRuntime(t, engine, &captureLogger{})

	r.ReconcileOrphans(context.Background(), "mine")

	if engine.listCalls != 1 {
		t.Fatalf("list calls = %d, want 1", engine.listCalls)
	}
	if !strings.Contains(engine.listFilters, "oasm-managed=true") {
		t.Fatalf("list filters = %q, want it to contain oasm-managed=true", engine.listFilters)
	}
}

func TestReconcileLogSummary(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.list = []types.Container{
		managed("exit-1", "exited", "x"),
		managed("run-1", "running", "other"),
	}
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	r.ReconcileOrphans(context.Background(), "mine")

	line, ok := log.find("orphan reconcile:")
	if !ok {
		t.Fatalf("expected a summary log line, got: %v", log.all())
	}
	for _, want := range []string{"stopped=1", "own_running=0", "foreign_kept=1", "failed=0"} {
		if !strings.Contains(line, want) {
			t.Fatalf("summary %q must contain %q", line, want)
		}
	}
}

// A nil engine client (Docker unavailable) must be a no-op, not a panic.
func TestReconcileNilClientSafe(t *testing.T) {
	r := &DockerRuntime{}
	if rep := r.ReconcileOrphans(context.Background(), "x"); rep != (ReconcileReport{}) {
		t.Fatalf("report = %+v, want zero value for nil client", rep)
	}
}
