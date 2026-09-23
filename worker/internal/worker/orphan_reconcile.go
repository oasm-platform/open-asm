package worker

import (
	"context"
	"time"

	"oasm-worker/internal/runtime"
)

// orphanReconciler is the startup wiring's view of the runtime: the single
// one-shot reconcile call. An interface so the wiring (timeout + owner
// delegation) is unit-testable with a stub.
type orphanReconciler interface {
	ReconcileOrphans(ctx context.Context, ownerID string) runtime.ReconcileReport
}

// reconcileStartupOrphans runs the one-shot orphan reconcile with a bounded
// timeout so a hung Docker engine cannot stall worker startup. Called once
// from Start() for every node worker — pool enabled or not — before
// grpcClient.Connect; ownerID is the boot identity (signature or persisted
// token), i.e. the same fingerprint the previous run stamped its containers
// with. The runtime logs its own tier summary; the report is returned for
// callers/tests that want to inspect it.
func reconcileStartupOrphans(ctx context.Context, rt orphanReconciler, ownerID string, timeout time.Duration) runtime.ReconcileReport {
	if rt == nil {
		return runtime.ReconcileReport{}
	}
	rctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return rt.ReconcileOrphans(rctx, ownerID)
}
