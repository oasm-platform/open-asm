package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"

	"google.golang.org/protobuf/types/known/structpb"

	"oasm-worker/internal/connector"
	"oasm-worker/internal/execution"
	pb "oasm-worker/internal/gen/jobs_registry"
)

// The JobSpec that reaches DockerRuntime.Create must carry the worker's
// ownership fingerprint so every connector container is stamped with
// oasm.worker_id — the basis of the next boot's orphan reconcile.
func TestProcessConnectorJobStampsOwnerWorkerID(t *testing.T) {
	bridgeMu.Lock()
	bridge = make(map[string]*bridgeEntry)
	bridgeMu.Unlock()

	t.Setenv("WORKER_SIGNATURE", "sig-owner-test")
	t.Setenv("WORKER_TOKEN_FILE", filepath.Join(t.TempDir(), ".worker-token"))

	client, jobsSrv, fakeRT := newWorkerTestSetup(t)
	mgr := execution.NewManager(fakeRT, 0) // unlimited
	proxy := connector.NewProxy()

	inputs, _ := structpb.NewStruct(map[string]any{"target": "https://example.com"})
	jobsSrv.nextFn = func() (*pb.Job, error) {
		return &pb.Job{
			Id:     "job-owner-1",
			Tool:   "nuclei",
			Image:  "ghcr.io/open-asm/nuclei:1.0",
			Inputs: inputs,
		}, nil
	}

	events := make(chan TuiEvent, 64)
	releaseCh := make(chan struct{}, 1)
	releaseSem := func() { releaseCh <- struct{}{} }

	hadJob, _ := processJob(context.Background(), client, nil, "", events, mgr, proxy, releaseSem)
	if !hadJob {
		t.Fatal("expected hadJob=true")
	}
	if len(fakeRT.CreateSpecs) != 1 {
		t.Fatalf("expected 1 Create call, got %d", len(fakeRT.CreateSpecs))
	}

	// Contract: hash("sig:" + WORKER_SIGNATURE), first 8 bytes hex-encoded.
	// Duplicated here on purpose — the label format must not drift silently
	// between grpcclient and its consumers.
	sum := sha256.Sum256([]byte("sig:sig-owner-test"))
	want := hex.EncodeToString(sum[:8])

	got := fakeRT.CreateSpecs[0].WorkerID
	if got != want {
		t.Fatalf("spec.WorkerID = %q, want %q", got, want)
	}
	if got != client.OwnerID() {
		t.Fatalf("spec.WorkerID = %q must equal client.OwnerID() = %q", got, client.OwnerID())
	}
}
