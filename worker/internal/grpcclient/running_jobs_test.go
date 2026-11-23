package grpcclient

import (
	"context"
	"sort"
	"testing"
	"time"

	jobsRegistry "oasm-worker/internal/gen/jobs_registry"
	workers "oasm-worker/internal/gen/workers"
)

// recordJoins makes the fake Join succeed and returns the running job ids
// each Join call reported, in call order.
func recordJoins(srv *testServer) func() [][]string {
	var reported [][]string
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		ids := append([]string(nil), req.GetRunningJobIds()...)
		sort.Strings(ids)
		srv.workersSrv.mu.Lock()
		reported = append(reported, ids)
		srv.workersSrv.mu.Unlock()
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}
	return func() [][]string {
		srv.workersSrv.mu.Lock()
		defer srv.workersSrv.mu.Unlock()
		return reported
	}
}

func batchOf(ids ...string) *jobsRegistry.JobList {
	list := &jobsRegistry.JobList{}
	for _, id := range ids {
		list.Values = append(list.Values, &jobsRegistry.Job{Id: id})
	}
	return list
}

func TestJoin_ReportsClaimedJobsUntilTheirSlotIsReleased(t *testing.T) {
	// Given: a worker that claimed two jobs
	srv := newTestServer(t)
	joins := recordJoins(srv)
	srv.jobsSrv.nextBatchFn = func(ctx context.Context, req *jobsRegistry.NextBatchRequest) (*jobsRegistry.JobList, error) {
		return batchOf("job-1", "job-2"), nil
	}
	if _, err := srv.client.NextJobs(context.Background(), 2); err != nil {
		t.Fatal(err)
	}

	// When: it rejoins, finishes one job, and rejoins again
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatal(err)
	}
	srv.client.ReleaseJob("job-1")
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatal(err)
	}

	// Then
	got := joins()
	if len(got) != 2 {
		t.Fatalf("expected 2 joins, got %d", len(got))
	}
	if want := []string{"job-1", "job-2"}; !equalIDs(got[0], want) {
		t.Errorf("first join reported %v, want %v", got[0], want)
	}
	if want := []string{"job-2"}; !equalIDs(got[1], want) {
		t.Errorf("second join reported %v, want %v", got[1], want)
	}
}

func TestJoin_ReportsNothingBeforeAnyClaim(t *testing.T) {
	// Given
	srv := newTestServer(t)
	joins := recordJoins(srv)

	// When
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatal(err)
	}

	// Then
	if got := joins(); len(got) != 1 || len(got[0]) != 0 {
		t.Errorf("expected one join reporting no job, got %v", got)
	}
}

func TestJoin_WaitsForAClaimInFlightAndReportsItsJobs(t *testing.T) {
	// Given: a claim whose response is still on its way when Join starts. Core
	// has already marked the job IN_PROGRESS for this worker; a Join that did
	// not list it would have core requeue a job this worker is about to run.
	srv := newTestServer(t)
	joins := recordJoins(srv)
	claimReceived := make(chan struct{})
	releaseClaim := make(chan struct{})
	srv.jobsSrv.nextBatchFn = func(ctx context.Context, req *jobsRegistry.NextBatchRequest) (*jobsRegistry.JobList, error) {
		close(claimReceived)
		<-releaseClaim
		return batchOf("job-late"), nil
	}
	claimDone := make(chan error, 1)
	go func() {
		_, err := srv.client.NextJobs(context.Background(), 1)
		claimDone <- err
	}()
	<-claimReceived

	// When
	joinDone := make(chan error, 1)
	go func() { joinDone <- srv.client.Join(context.Background()) }()

	// Then: the join holds until the claim has been recorded
	select {
	case <-joinDone:
		t.Fatal("join completed while a claim was in flight")
	case <-time.After(100 * time.Millisecond):
	}
	close(releaseClaim)
	if err := <-claimDone; err != nil {
		t.Fatal(err)
	}
	if err := <-joinDone; err != nil {
		t.Fatal(err)
	}
	if got := joins(); len(got) != 1 || !equalIDs(got[0], []string{"job-late"}) {
		t.Errorf("expected the join to report job-late, got %v", got)
	}
}

func TestNextJobs_GivesUpOnAClaimThatNeverAnswers(t *testing.T) {
	// Given: a core that never answers the claim. Join waits for claims, so a
	// claim without a deadline would block every reconnect.
	srv := newTestServer(t)
	srv.client.claimTimeout = 50 * time.Millisecond
	srv.jobsSrv.nextBatchFn = func(ctx context.Context, req *jobsRegistry.NextBatchRequest) (*jobsRegistry.JobList, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}

	// When
	started := time.Now()
	_, err := srv.client.NextJobs(context.Background(), 1)

	// Then
	if err == nil {
		t.Fatal("expected the claim to fail")
	}
	if elapsed := time.Since(started); elapsed > 5*time.Second {
		t.Errorf("claim took %s, expected it to give up after its timeout", elapsed)
	}
}

func TestReleaseJob_IgnoresAJobItNeverClaimed(t *testing.T) {
	// Given
	srv := newTestServer(t)
	joins := recordJoins(srv)

	// When: a release for an unknown or already released job
	srv.client.ReleaseJob("never-claimed")
	srv.client.ReleaseJob("never-claimed")

	// Then
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := joins(); len(got) != 1 || len(got[0]) != 0 {
		t.Errorf("expected no running job, got %v", got)
	}
}

func equalIDs(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
