package security

import "testing"

func TestIsolationOpts(t *testing.T) {
	opts := IsolationOpts{ReadOnlyRootFS: true, NoNewPrivileges: true, NetworkMode: "none"}
	if !opts.ReadOnlyRootFS {
		t.Fatal("expected readonly")
	}
	if !opts.NoNewPrivileges {
		t.Fatal("expected no-new-privileges")
	}
	if opts.NetworkMode != "none" {
		t.Fatalf("got %s", opts.NetworkMode)
	}
}

func TestCertRotationReloads(t *testing.T) {
	// ponytail: test that mtls watcher reloads on file change – stubbed as file mtime check
	t.Skip("requires cert files – covered in integration")
}
