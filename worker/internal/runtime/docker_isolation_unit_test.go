package runtime

import (
	"slices"
	"testing"

	"github.com/docker/docker/api/types/container"

	"oasm-worker/internal/security"
)

// W4: security.DefaultIsolation must reach the Docker HostConfig. The Create
// path previously hardcoded SecurityOpt=no-new-privileges and
// ReadonlyRootfs=false, dropping ReadOnlyRootFS/NetworkMode/PidsLimit entirely.
func TestApplyDefaultIsolationHardensHostConfig(t *testing.T) {
	iso := security.DefaultIsolation()
	hc := &container.HostConfig{}
	applyDefaultIsolation(hc)
	if !hc.ReadonlyRootfs {
		t.Fatal("ReadonlyRootfs must be true (security.DefaultIsolation)")
	}
	if string(hc.NetworkMode) != iso.NetworkMode {
		t.Fatalf("NetworkMode = %q, want %q", hc.NetworkMode, iso.NetworkMode)
	}
	if hc.Resources.PidsLimit == nil || *hc.Resources.PidsLimit != iso.PidsLimit {
		t.Fatalf("PidsLimit = %v, want %d", hc.Resources.PidsLimit, iso.PidsLimit)
	}
	if !slices.Contains(hc.SecurityOpt, "no-new-privileges:true") {
		t.Fatalf("SecurityOpt must contain no-new-privileges:true, got %v", hc.SecurityOpt)
	}
}

// Pre-existing host-config opts (tmpfs caches, per-image persistence volume)
// must survive the isolation pass untouched — the pass only ADDS hardening.
func TestApplyDefaultIsolationKeepsExistingOpts(t *testing.T) {
	wantBind := volumeNameForImage("ghcr.io/test/image:1.0") + ":/data"
	hc := &container.HostConfig{
		Binds: []string{wantBind},
		Tmpfs: map[string]string{"/tmp": "rw,nosuid,nodev,size=256m"},
	}
	applyDefaultIsolation(hc)
	if len(hc.Binds) != 1 || hc.Binds[0] != wantBind {
		t.Fatalf("Binds must survive isolation, got %v", hc.Binds)
	}
	if hc.Tmpfs["/tmp"] != "rw,nosuid,nodev,size=256m" {
		t.Fatalf("Tmpfs must survive isolation, got %v", hc.Tmpfs)
	}
}
