package worker

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// stubOrphanReconciler records how the startup wiring called the runtime.
type stubOrphanReconciler struct {
	called      bool
	ownerID     string
	hasDeadline bool
	report      runtime.ReconcileReport
}

func (s *stubOrphanReconciler) ReconcileOrphans(ctx context.Context, ownerID string) runtime.ReconcileReport {
	s.called = true
	s.ownerID = ownerID
	_, s.hasDeadline = ctx.Deadline()
	return s.report
}

func TestReconcileStartupOrphansDelegatesWithTimeout(t *testing.T) {
	stub := &stubOrphanReconciler{report: runtime.ReconcileReport{StoppedRemoved: 2}}

	rep := reconcileStartupOrphans(context.Background(), stub, "owner-xyz", 30*time.Second)

	if !stub.called {
		t.Fatal("expected ReconcileOrphans to be invoked")
	}
	if stub.ownerID != "owner-xyz" {
		t.Fatalf("ownerID passed = %q, want %q", stub.ownerID, "owner-xyz")
	}
	if !stub.hasDeadline {
		t.Fatal("reconcile context must carry a deadline so a hung engine cannot stall startup")
	}
	if rep != stub.report {
		t.Fatalf("report = %+v, want passthrough %+v", rep, stub.report)
	}
}

// Source guard for Start(): the reconcile call must exist, replace the old
// prune (which skipped running containers), sit OUTSIDE `if cfg.PoolEnabled`
// (pool-disabled workers leak orphans too), and run BEFORE Connect (a fresh
// process must list containers while it has none of its own).
func TestStartReconcilesOrphansOutsidePoolBranchAndBeforeConnect(t *testing.T) {
	data, err := os.ReadFile("client.go")
	if err != nil {
		t.Fatalf("read client.go: %v", err)
	}
	src := string(data)

	if strings.Contains(src, "PrunePoolContainers") {
		t.Fatal("startup prune must be fully replaced by reconcileStartupOrphans (prune never removed running containers)")
	}

	recIdx := strings.Index(src, "reconcileStartupOrphans(")
	if recIdx < 0 {
		t.Fatal("client.go must call reconcileStartupOrphans at startup")
	}

	poolIdx := strings.Index(src, "if cfg.PoolEnabled {")
	if poolIdx < 0 {
		t.Fatal("expected if cfg.PoolEnabled branch in client.go")
	}
	poolEnd := matchingBraceEnd(src, poolIdx+len("if cfg.PoolEnabled {")-1)
	if poolEnd < 0 {
		t.Fatal("unbalanced braces around if cfg.PoolEnabled")
	}
	if recIdx > poolIdx && recIdx < poolEnd {
		t.Fatal("reconcileStartupOrphans must run even when the pool is disabled: move it outside if cfg.PoolEnabled")
	}

	connIdx := strings.Index(src, "go grpcClient.Connect(workerCtx, ready)")
	if connIdx < 0 {
		t.Fatal("expected go grpcClient.Connect(workerCtx, ready) in client.go")
	}
	if connIdx < recIdx {
		t.Fatal("grpcClient.Connect must start AFTER the orphan reconcile (otherwise a fresh job could create a container mid-list)")
	}
}

// matchingBraceEnd returns the index of the '}' closing the '{' at openIdx.
func matchingBraceEnd(src string, openIdx int) int {
	depth := 0
	for i := openIdx; i < len(src); i++ {
		switch src[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}
