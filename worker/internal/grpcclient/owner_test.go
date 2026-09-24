package grpcclient

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	workers "oasm-worker/internal/gen/workers"
)

// OwnerID must derive from the persisted join token so a restart produces
// the same ownership fingerprint that was stamped into containers before
// the crash.
func TestOwnerIDFromTokenFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".worker-token")
	if err := os.WriteFile(path, []byte("tok-from-file\n"), 0o600); err != nil {
		t.Fatalf("seed token file: %v", err)
	}
	t.Setenv("WORKER_TOKEN_FILE", path)
	t.Setenv("WORKER_SIGNATURE", "")

	srv := newTestServer(t)

	id := srv.client.OwnerID()
	if id == "" {
		t.Fatal("OwnerID() must not be empty when a token was resumed from the file")
	}
	if len(id) != 16 {
		t.Fatalf("OwnerID() = %q, want 16 hex chars", id)
	}
	if strings.Contains(id, "tok-from-file") {
		t.Fatalf("OwnerID() = %q must not leak the raw token", id)
	}
	if id != srv.client.OwnerID() {
		t.Fatal("OwnerID() must be stable across calls")
	}
}

// WORKER_SIGNATURE takes precedence over the token: operators pin identity
// with a signature even when the join token rotates.
func TestOwnerIDPrefersSignatureOverToken(t *testing.T) {
	t.Setenv("WORKER_SIGNATURE", "sig-1")

	dirA, dirB := t.TempDir(), t.TempDir()
	pathA := filepath.Join(dirA, ".worker-token")
	pathB := filepath.Join(dirB, ".worker-token")
	if err := os.WriteFile(pathA, []byte("tok-A\n"), 0o600); err != nil {
		t.Fatalf("seed token A: %v", err)
	}
	if err := os.WriteFile(pathB, []byte("tok-B\n"), 0o600); err != nil {
		t.Fatalf("seed token B: %v", err)
	}

	t.Setenv("WORKER_TOKEN_FILE", pathA)
	srvA := newTestServer(t)

	t.Setenv("WORKER_TOKEN_FILE", pathB)
	srvB := newTestServer(t)

	if srvA.client.OwnerID() != srvB.client.OwnerID() {
		t.Fatalf("same signature must yield same OwnerID regardless of token: %q vs %q",
			srvA.client.OwnerID(), srvB.client.OwnerID())
	}

	t.Setenv("WORKER_SIGNATURE", "sig-2")
	t.Setenv("WORKER_TOKEN_FILE", pathA)
	srvC := newTestServer(t)
	if srvC.client.OwnerID() == srvA.client.OwnerID() {
		t.Fatal("different signatures must yield different OwnerIDs")
	}
}

// First-ever run: no signature, no token file → empty OwnerID. Callers must
// then fall back to the safe reconcile tier (stopped containers only).
func TestOwnerIDEmptyWithoutIdentity(t *testing.T) {
	t.Setenv("WORKER_TOKEN_FILE", filepath.Join(t.TempDir(), "missing-token"))
	t.Setenv("WORKER_SIGNATURE", "")

	srv := newTestServer(t)

	if got := srv.client.OwnerID(); got != "" {
		t.Fatalf("OwnerID() = %q, want empty when neither signature nor token exists", got)
	}
}

// A fresh worker joins and receives a token; a simulated restart (second
// client resuming the persisted token) must derive the identical OwnerID —
// that is what lets the next boot's reconcile recognize its own orphans.
func TestOwnerIDRefreshedAfterJoin(t *testing.T) {
	t.Setenv("WORKER_SIGNATURE", "")
	tokenPath := filepath.Join(t.TempDir(), ".worker-token")
	t.Setenv("WORKER_TOKEN_FILE", tokenPath)

	srv := newTestServer(t)
	if got := srv.client.OwnerID(); got != "" {
		t.Fatalf("OwnerID() before join = %q, want empty", got)
	}

	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-joined"}, nil
	}
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatalf("Join: %v", err)
	}

	joined := srv.client.OwnerID()
	if joined == "" {
		t.Fatal("OwnerID() after join must be derived from the issued token")
	}

	// Simulated restart: a new client resumes the persisted token file.
	srv2 := newTestServer(t)
	if got := srv2.client.OwnerID(); got != joined {
		t.Fatalf("restarted OwnerID() = %q, want %q (must match pre-crash stamps)", got, joined)
	}
}
