package runtime

import (
	"slices"
	"strings"
	"testing"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
)

func sandboxSpec() AgentSandboxSpec {
	return AgentSandboxSpec{
		Image:       "oasm/oasm-worker:latest",
		SessionID:   "sess-1",
		OwnerID:     "owner-abc",
		ToolsMount:  &mount.Mount{Type: mount.TypeVolume, Source: "open-asm_worker-tools-cache", Target: "/app/oasm-tools", ReadOnly: true},
		ToolsTarget: "/app/oasm-tools",
	}
}

// The sandbox env is built from scratch: no worker secret may reach it.
func TestBuildAgentSandboxConfig_MinimalEnv(t *testing.T) {
	cfg, _ := BuildAgentSandboxConfig(sandboxSpec())
	want := []string{
		"PATH=/app/oasm-tools:" + agentSandboxBasePath,
		"HOME=/workspace",
	}
	if !slices.Equal(cfg.Env, want) {
		t.Fatalf("Env = %v, want %v", cfg.Env, want)
	}
	if !slices.Equal(cfg.Entrypoint, []string{"sleep", "infinity"}) {
		t.Fatalf("Entrypoint = %v, want [sleep infinity] (the image entrypoint is the worker itself)", cfg.Entrypoint)
	}
	if cfg.User != "1000:1000" || cfg.WorkingDir != "/workspace" || cfg.Image != "oasm/oasm-worker:latest" {
		t.Fatalf("User/WorkingDir/Image = %q/%q/%q", cfg.User, cfg.WorkingDir, cfg.Image)
	}
}

// The exec must not inherit the image's ENV (the worker image bakes WORKER_*
// defaults): env -i with only the sandbox env, then the wrapped command.
func TestAgentSandboxExecCmd(t *testing.T) {
	got := agentSandboxExecCmd("/app/oasm-tools", "ls -la")
	want := []string{
		"env", "-i",
		"PATH=/app/oasm-tools:" + agentSandboxBasePath,
		"HOME=/workspace",
		"sh", "-c", "(ls -la) 2>&1",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("exec cmd = %q, want %q", got, want)
	}
}

func TestBuildAgentSandboxConfig_Labels(t *testing.T) {
	cfg, _ := BuildAgentSandboxConfig(sandboxSpec())
	want := map[string]string{
		"oasm.agent_sandbox": "true",
		"oasm.session_id":    "sess-1",
		"oasm.worker_id":     "owner-abc",
	}
	for k, v := range want {
		if cfg.Labels[k] != v {
			t.Errorf("label %s = %q, want %q", k, cfg.Labels[k], v)
		}
	}
	// Not oasm-managed: the connector pool/reconcile must not treat a
	// sandbox as one of its containers.
	if _, ok := cfg.Labels["oasm-managed"]; ok {
		t.Error("sandbox must not carry the oasm-managed label")
	}

	spec := sandboxSpec()
	spec.OwnerID = ""
	cfg, _ = BuildAgentSandboxConfig(spec)
	if _, ok := cfg.Labels["oasm.worker_id"]; ok {
		t.Error("empty owner must omit oasm.worker_id")
	}
}

func TestBuildAgentSandboxConfig_HostHardening(t *testing.T) {
	_, hc := BuildAgentSandboxConfig(sandboxSpec())
	if !hc.ReadonlyRootfs {
		t.Error("ReadonlyRootfs must be true")
	}
	if !slices.Equal(hc.CapDrop, []string{"ALL"}) {
		t.Errorf("CapDrop = %v, want [ALL]", hc.CapDrop)
	}
	if len(hc.CapAdd) != 0 || hc.Privileged {
		t.Errorf("no capabilities or privilege may be granted: CapAdd=%v Privileged=%v", hc.CapAdd, hc.Privileged)
	}
	if !slices.Contains(hc.SecurityOpt, "no-new-privileges:true") {
		t.Errorf("SecurityOpt = %v, want no-new-privileges:true", hc.SecurityOpt)
	}
	if hc.NetworkMode != "bridge" {
		t.Errorf("NetworkMode = %q, want bridge", hc.NetworkMode)
	}
	if hc.Resources.PidsLimit == nil || *hc.Resources.PidsLimit <= 0 {
		t.Error("PidsLimit must be set")
	}
	if hc.Resources.Memory <= 0 || hc.Resources.MemorySwap != hc.Resources.Memory || hc.Resources.NanoCPUs <= 0 {
		t.Errorf("Memory/MemorySwap/NanoCPUs = %d/%d/%d", hc.Resources.Memory, hc.Resources.MemorySwap, hc.Resources.NanoCPUs)
	}
	for _, p := range []string{"/workspace", "/tmp"} {
		opts := hc.Tmpfs[p]
		if !strings.Contains(opts, "rw") || !strings.Contains(opts, "size=") || !strings.Contains(opts, "mode=1777") {
			t.Errorf("tmpfs %s = %q, want rw, size-capped, mode=1777", p, opts)
		}
	}
}

// Only the tools mount, read-only: no docker.sock, no state/token volume,
// no other host path.
func TestBuildAgentSandboxConfig_OnlyReadOnlyToolsMount(t *testing.T) {
	_, hc := BuildAgentSandboxConfig(sandboxSpec())
	if len(hc.Binds) != 0 || len(hc.VolumesFrom) != 0 {
		t.Fatalf("Binds=%v VolumesFrom=%v, want none", hc.Binds, hc.VolumesFrom)
	}
	if len(hc.Mounts) != 1 {
		t.Fatalf("Mounts = %v, want exactly the tools mount", hc.Mounts)
	}
	m := hc.Mounts[0]
	if !m.ReadOnly || m.Target != "/app/oasm-tools" || m.Source != "open-asm_worker-tools-cache" {
		t.Fatalf("tools mount = %+v, want read-only volume at /app/oasm-tools", m)
	}

	spec := sandboxSpec()
	spec.ToolsMount = nil
	_, hc = BuildAgentSandboxConfig(spec)
	if len(hc.Mounts) != 0 {
		t.Fatalf("no tools mount requested, got %v", hc.Mounts)
	}
}

func selfContainer(image string, mounts ...types.MountPoint) *types.ContainerJSON {
	return &types.ContainerJSON{
		ContainerJSONBase: &types.ContainerJSONBase{Image: image},
		Config:            &container.Config{Image: "oasm/oasm-worker:latest"},
		Mounts:            mounts,
	}
}

func TestResolveSandboxToolsMount(t *testing.T) {
	const tp = "/app/oasm-tools"
	cases := []struct {
		name     string
		override string
		toolPath string
		self     *types.ContainerJSON
		want     *mount.Mount // nil = no mount
	}{
		{
			name:     "override volume name",
			override: "my-tools", toolPath: tp,
			self: selfContainer("sha256:x"),
			want: &mount.Mount{Type: mount.TypeVolume, Source: "my-tools"},
		},
		{
			name:     "override absolute host path",
			override: "/srv/tools", toolPath: tp,
			want: &mount.Mount{Type: mount.TypeBind, Source: "/srv/tools"},
		},
		{
			name:     "override windows host path",
			override: `C:\oasm\tools`, toolPath: tp,
			want: &mount.Mount{Type: mount.TypeBind, Source: `C:\oasm\tools`},
		},
		{
			name:     "containerized: volume at tool path",
			toolPath: tp,
			self: selfContainer("sha256:x",
				types.MountPoint{Type: mount.TypeVolume, Name: "open-asm_worker-state", Source: "/var/lib/docker/volumes/s/_data", Destination: "/app/state"},
				types.MountPoint{Type: mount.TypeVolume, Name: "open-asm_worker-tools-cache", Source: "/var/lib/docker/volumes/t/_data", Destination: tp},
			),
			want: &mount.Mount{Type: mount.TypeVolume, Source: "open-asm_worker-tools-cache"},
		},
		{
			name:     "containerized: bind at tool path",
			toolPath: tp,
			self: selfContainer("sha256:x",
				types.MountPoint{Type: mount.TypeBind, Source: "/var/run/docker.sock", Destination: "/var/run/docker.sock"},
				types.MountPoint{Type: mount.TypeBind, Source: "/home/u/tools", Destination: tp},
			),
			want: &mount.Mount{Type: mount.TypeBind, Source: "/home/u/tools"},
		},
		{
			// Never fall back to mounting some other worker mount (the
			// socket, the state volume) when nothing sits at the tool path.
			name:     "containerized: nothing at tool path",
			toolPath: tp,
			self: selfContainer("sha256:x",
				types.MountPoint{Type: mount.TypeBind, Source: "/var/run/docker.sock", Destination: "/var/run/docker.sock"},
			),
			want: nil,
		},
		{
			name:     "host worker: host tool path",
			toolPath: "/home/u/.oasm/oasm-tools",
			want:     &mount.Mount{Type: mount.TypeBind, Source: "/home/u/.oasm/oasm-tools"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			target := sandboxToolsTarget(tc.toolPath)
			got := resolveSandboxToolsMount(tc.override, tc.toolPath, target, tc.self)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("got %+v, want no mount", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("got no mount, want %+v", tc.want)
			}
			if got.Type != tc.want.Type || got.Source != tc.want.Source || got.Target != target || !got.ReadOnly {
				t.Fatalf("got %+v, want %s %s -> %s read-only", got, tc.want.Type, tc.want.Source, target)
			}
		})
	}
}

func TestSandboxToolsTarget(t *testing.T) {
	if got := sandboxToolsTarget("/app/oasm-tools"); got != "/app/oasm-tools" {
		t.Errorf("POSIX tool path must be kept, got %q", got)
	}
	if got := sandboxToolsTarget(`C:\Users\u\.oasm\oasm-tools`); got != agentSandboxToolsFallback {
		t.Errorf("Windows tool path must map to %s, got %q", agentSandboxToolsFallback, got)
	}
}

func TestResolveSandboxImage(t *testing.T) {
	if got := resolveSandboxImage("custom:1", selfContainer("sha256:self")); got != "custom:1" {
		t.Errorf("override must win, got %q", got)
	}
	if got := resolveSandboxImage("", selfContainer("sha256:self")); got != "sha256:self" {
		t.Errorf("containerized worker must reuse its own image id, got %q", got)
	}
	if got := resolveSandboxImage("", nil); got != "oasm/oasm-worker:latest" {
		t.Errorf("host worker default = %q, want oasm/oasm-worker:latest", got)
	}
}

func TestAgentSandboxName(t *testing.T) {
	n := agentSandboxName("3F2A9C1E-0000-4000-8000-ABCDEFABCDEF/../x")
	if !strings.HasPrefix(n, "oasm-agent-") || len(n) > 128 || strings.ContainsAny(n, "/. ") {
		t.Fatalf("invalid container name %q", n)
	}
}
