package grpcclient

import (
	"path/filepath"
	"testing"
)

// A lone worker claims slot 0 — the configured path itself — so an existing
// deployment keeps resuming the identity it already persisted.
func TestClaimTokenFileLoneWorkerKeepsBasePath(t *testing.T) {
	base := filepath.Join(t.TempDir(), ".worker-token")
	path, lock := claimTokenFile(base, &noOpLogger{})
	defer lock.Unlock()
	if path != base {
		t.Fatalf("path = %q, want base %q", path, base)
	}
	if lock == nil {
		t.Fatal("lone worker must hold its slot lock")
	}
}

// Concurrent workers sharing one location (scaled compose replicas on one
// state volume) each get a distinct slot instead of resuming one identity.
func TestClaimTokenFileConcurrentWorkersGetDistinctSlots(t *testing.T) {
	base := filepath.Join(t.TempDir(), ".worker-token")
	p0, l0 := claimTokenFile(base, &noOpLogger{})
	defer l0.Unlock()
	p1, l1 := claimTokenFile(base, &noOpLogger{})
	defer l1.Unlock()
	p2, l2 := claimTokenFile(base, &noOpLogger{})
	defer l2.Unlock()
	if p0 != base || p1 != base+".1" || p2 != base+".2" {
		t.Fatalf("slots = %q, %q, %q; want base, base.1, base.2", p0, p1, p2)
	}
}

// A slot freed by an exited worker is reused by the next one to start, so a
// restarted replica resumes an existing identity instead of minting a new one.
func TestClaimTokenFileReusesReleasedSlot(t *testing.T) {
	base := filepath.Join(t.TempDir(), ".worker-token")
	_, l0 := claimTokenFile(base, &noOpLogger{})
	_, l1 := claimTokenFile(base, &noOpLogger{})
	defer l1.Unlock()
	_ = l0.Unlock()
	path, l := claimTokenFile(base, &noOpLogger{})
	defer l.Unlock()
	if path != base {
		t.Fatalf("path = %q, want released slot 0 %q", path, base)
	}
}
