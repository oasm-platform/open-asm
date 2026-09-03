package runtime

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

func TestDockerRuntimeCreateRequiresImage(t *testing.T) {
	r := &DockerRuntime{}
	_, err := r.Create(context.Background(), JobSpec{Tool: "nuclei"}, RuntimeOpts{})
	if err == nil {
		t.Fatal("expected error when Image is empty")
	}
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "image required") && !strings.Contains(msg, "image") {
		t.Fatalf("expected 'image required' error, got %q", err.Error())
	}
}

func TestDockerRuntimeCreateRequiresTool(t *testing.T) {
	r := &DockerRuntime{}
	_, err := r.Create(context.Background(), JobSpec{Image: "ghcr.io/open-asm/nuclei:1.0.0"}, RuntimeOpts{})
	if err == nil {
		t.Fatal("expected error when Tool is empty")
	}
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "tool required") && !strings.Contains(msg, "tool") {
		t.Fatalf("expected 'tool required' error, got %q", err.Error())
	}
}

func TestDockerRuntimeImplementsInterface(t *testing.T) {
	var _ ExecutionRuntime = (*DockerRuntime)(nil)
}

func TestDockerRuntimeUsesImageNotTool(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "spec.Image") {
		t.Fatalf("docker.go must use spec.Image, source does not contain spec.Image")
	}
	if !strings.Contains(src, "Image: spec.Image") && !strings.Contains(src, "Image:spec.Image") {
		t.Fatalf("docker.go must set container.Config{Image: spec.Image}, not found")
	}
	if strings.Contains(src, "Image: spec.Tool") {
		t.Fatalf("docker.go must not use spec.Tool as image (must use spec.Image)")
	}
}

func TestDockerRuntimeDoesNotExecCLI(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	if strings.Contains(src, "exec.Command") {
		t.Fatalf("docker.go must not use exec.Command (CLI ban)")
	}
	// combined guard: direct docker CLI invocations
	if strings.Contains(src, "\"docker\"") && strings.Contains(src, "exec.Command") {
		t.Fatalf("docker.go must not exec docker binary")
	}
	if strings.Contains(src, "docker run") {
		t.Fatalf("docker.go must not contain 'docker run' string (CLI ban)")
	}
	if strings.Contains(src, "docker ps") {
		t.Fatalf("docker.go must not contain 'docker ps' string (CLI ban)")
	}
}

func TestDockerRuntimeEnvIncludesOASMConfig(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "OASM_CONFIG") {
		t.Fatalf("docker.go must inject OASM_CONFIG env var for Config passthrough")
	}
}

func TestDockerRuntimeEnvOASMConfigConditional(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	// OASM_CONFIG must only be added when Config is non-nil to avoid empty JSON.
	// Check for a conditional guard (if spec.Config != nil, if len(spec.Config) > 0, etc.)
	if !strings.Contains(src, "spec.Config") {
		t.Fatalf("docker.go must reference spec.Config to conditionally inject OASM_CONFIG")
	}
}

func TestDockerRuntimeJobIDUsesSpecJobID(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	// JOB_ID env must be set from spec.JobID, not spec.Tool.
	if !strings.Contains(src, "spec.JobID") {
		t.Fatalf("docker.go must use spec.JobID for JOB_ID env var")
	}
	// The old buggy pattern must be gone.
	if strings.Contains(src, `"JOB_ID="+spec.Tool`) || strings.Contains(src, `"JOB_ID=" + spec.Tool`) {
		t.Fatalf("docker.go must not use spec.Tool for JOB_ID (pre-existing bug)")
	}
}

func TestDockerRuntimeNilConfigNoOASMConfigEnv(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	// Verify that OASM_CONFIG= is NOT unconditionally appended — it must be inside a nil/len check.
	// Find the env=append line with OASM_CONFIG= and ensure it's inside a conditional block.
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		if strings.Contains(line, `"OASM_CONFIG="`) || strings.Contains(line, "OASM_CONFIG=") {
			// Search backward for a conditional (if/else) in preceding 5 lines.
			start := i - 5
			if start < 0 {
				start = 0
			}
			before := strings.Join(lines[start:i], "\n")
			if !strings.Contains(before, "if ") {
				t.Fatalf("OASM_CONFIG= at line %d must be inside an if-block (nil Config should skip env), context: %s", i+1, before)
			}
			return
		}
	}
	t.Fatal("OASM_CONFIG= not found in docker.go source")
}

func TestDockerRuntimeEnvIncludesJobID(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "JOB_ID") {
		t.Fatalf("docker.go must include JOB_ID env var")
	}
}

func TestDockerRuntimeConfigJSONRoundTrip(t *testing.T) {
	// Verify that the json.Marshal pattern used for OASM_CONFIG produces valid JSON.
	cfg := map[string]any{"proxy": true, "rateLimit": float64(50)}
	b, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var roundTrip map[string]any
	if err := json.Unmarshal(b, &roundTrip); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if roundTrip["proxy"] != true {
		t.Fatalf("expected proxy=true after round trip, got %v", roundTrip["proxy"])
	}
}

// Behavioral tests for buildContainerEnv (replaces source-text assertions).

func TestBuildContainerEnvBaseVars(t *testing.T) {
	spec := JobSpec{JobID: "j-123", Tool: "nuclei", TraceID: "tr-456"}
	env := buildContainerEnv(spec, "host:50051", "tok-789", "exec-abc")

	assertEnvContains := func(key, want string) {
		t.Helper()
		for _, e := range env {
			if strings.HasPrefix(e, key+"=") {
				if e != key+"="+want {
					t.Fatalf("%s: got %q, want %q", key, e, key+"="+want)
				}
				return
			}
		}
		t.Fatalf("%s not found in env", key)
	}

	assertEnvContains("WORKER_GRPC_ADDR", "host:50051")
	assertEnvContains("WORKER_GRPC_HOST", "host")
	assertEnvContains("WORKER_GRPC_PORT", "50051")
	assertEnvContains("WORKER_TOKEN", "tok-789")
	assertEnvContains("EXECUTION_ID", "exec-abc")
	assertEnvContains("JOB_ID", "j-123")
	assertEnvContains("TOOL", "nuclei")
	assertEnvContains("TRACE_ID", "tr-456")
}

// buildContainerEnv must split the resolved dial address into
// WORKER_GRPC_HOST/_PORT for SDKs that need the parts separately, while
// WORKER_GRPC_ADDR stays byte-identical (bracketed IPv6 literals included).
func TestBuildContainerEnvSplitsGrpcHostPort(t *testing.T) {
	spec := JobSpec{JobID: "j-split", Tool: "nuclei", TraceID: "tr-split"}
	cases := []struct {
		name string
		addr string
		host string
		port string
	}{
		{"bracketed IPv6 override", "[fdc4:f303:9324::254]:50051", "fdc4:f303:9324::254", "50051"},
		{"plain hostname", "host.docker.internal:50051", "host.docker.internal", "50051"},
		{"default port flow", "host.docker.internal:26276", "host.docker.internal", "26276"},
		{"plain IPv4", "172.18.0.3:50051", "172.18.0.3", "50051"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := buildContainerEnv(spec, tc.addr, "tok", "exec-1")
			got := map[string]string{}
			for _, e := range env {
				k, v, ok := strings.Cut(e, "=")
				if ok {
					got[k] = v
				}
			}
			if got["WORKER_GRPC_ADDR"] != tc.addr {
				t.Fatalf("WORKER_GRPC_ADDR = %q, want %q (must stay verbatim)", got["WORKER_GRPC_ADDR"], tc.addr)
			}
			if got["WORKER_GRPC_HOST"] != tc.host {
				t.Fatalf("WORKER_GRPC_HOST = %q, want %q", got["WORKER_GRPC_HOST"], tc.host)
			}
			if got["WORKER_GRPC_PORT"] != tc.port {
				t.Fatalf("WORKER_GRPC_PORT = %q, want %q", got["WORKER_GRPC_PORT"], tc.port)
			}
		})
	}
}

// A dial address without a port (e.g. a bare service-name override such as
// WORKER_CONNECTOR_ADDR=oasm-worker) emits WORKER_GRPC_HOST only — the port is
// unknown, so no WORKER_GRPC_PORT var is invented.
func TestBuildContainerEnvNoPortAddrEmitsHostOnly(t *testing.T) {
	spec := JobSpec{JobID: "j-noport", Tool: "nuclei", TraceID: "tr-noport"}
	env := buildContainerEnv(spec, "oasm-worker", "tok", "exec-1")
	var hostFound bool
	for _, e := range env {
		if strings.HasPrefix(e, "WORKER_GRPC_PORT=") {
			t.Fatalf("no-port addr must not emit WORKER_GRPC_PORT, got %q", e)
		}
		if e == "WORKER_GRPC_HOST=oasm-worker" {
			hostFound = true
		}
	}
	if !hostFound {
		t.Fatal("WORKER_GRPC_HOST=oasm-worker not found in env")
	}
}

func TestBuildContainerEnvOASMConfig(t *testing.T) {
	spec := JobSpec{
		JobID:   "j-cfg",
		Tool:    "subfinder",
		TraceID: "tr-cfg",
		Config:  map[string]any{"proxy": true, "rateLimit": float64(50)},
	}
	env := buildContainerEnv(spec, "", "", "")

	var found string
	for _, e := range env {
		if strings.HasPrefix(e, "OASM_CONFIG=") {
			found = e
			break
		}
	}
	if found == "" {
		t.Fatal("OASM_CONFIG not found in env when Config is provided")
	}

	// Parse and verify the JSON content.
	jsonStr := strings.TrimPrefix(found, "OASM_CONFIG=")
	var parsed map[string]any
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		t.Fatalf("OASM_CONFIG is not valid JSON: %v", err)
	}
	if parsed["proxy"] != true {
		t.Fatalf("expected proxy=true in OASM_CONFIG, got %v", parsed["proxy"])
	}
}

func TestBuildContainerEnvNilConfig(t *testing.T) {
	spec := JobSpec{JobID: "j-no", Tool: "nuclei", TraceID: "tr-no"}
	env := buildContainerEnv(spec, "", "", "")

	for _, e := range env {
		if strings.HasPrefix(e, "OASM_CONFIG=") {
			t.Fatalf("OASM_CONFIG should NOT be present when Config is nil, got %q", e)
		}
	}
}

// resolveHost precedence tests: explicit arg > WORKER_DOCKER_HOST > DOCKER_HOST > platform default.

func TestResolveHostWindowsDefaultUsesNpipe(t *testing.T) {
	got := resolveHost("", "", "", "windows")
	want := "npipe:////./pipe/docker_engine"
	if got != want {
		t.Fatalf("resolveHost() on windows with no env = %q, want %q (Docker Desktop npipe)", got, want)
	}
}

func TestResolveHostLinuxDefaultUsesUnixSocket(t *testing.T) {
	got := resolveHost("", "", "", "linux")
	want := "unix:///var/run/docker.sock"
	if got != want {
		t.Fatalf("resolveHost() on linux with no env = %q, want %q", got, want)
	}
}

func TestResolveHostPreservesExistingDockerHostEnv(t *testing.T) {
	got := resolveHost("", "tcp://127.0.0.1:2375", "", "windows")
	want := "tcp://127.0.0.1:2375"
	if got != want {
		t.Fatalf("resolveHost() must keep a pre-set DOCKER_HOST (no clobber) = %q, want %q", got, want)
	}
}

func TestResolveHostWorkerDockerHostWinsOverDockerHost(t *testing.T) {
	got := resolveHost("", "tcp://127.0.0.1:2375", "npipe:////./pipe/docker_engine", "linux")
	want := "npipe:////./pipe/docker_engine"
	if got != want {
		t.Fatalf("resolveHost() WORKER_DOCKER_HOST must override DOCKER_HOST = %q, want %q", got, want)
	}
}

func TestResolveHostExplicitHostArgWinsOverAll(t *testing.T) {
	got := resolveHost("tcp://127.0.0.1:2375", "npipe:////./pipe/docker_engine", "unix:///var/run/docker.sock", "windows")
	want := "tcp://127.0.0.1:2375"
	if got != want {
		t.Fatalf("resolveHost() explicit host arg must win over envs = %q, want %q", got, want)
	}
}

// Docker host resolution must never mutate the process environment (a pre-set
// DOCKER_HOST must survive NewDockerRuntime untouched).
func TestDockerRuntimeNeverClobbersDockerHostEnv(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	src := string(data)
	if strings.Contains(src, `os.Setenv("DOCKER_HOST"`) || strings.Contains(src, "os.Setenv(`DOCKER_HOST`") {
		t.Fatalf("docker.go must never Setenv DOCKER_HOST (would clobber a pre-set value)")
	}
}

func TestBuildContainerEnvInputs(t *testing.T) {
	spec := JobSpec{
		JobID:   "j-in",
		Tool:    "nuclei",
		TraceID: "tr-in",
		Inputs:  map[string]any{"target": "example.com", "severity": "high"},
	}
	env := buildContainerEnv(spec, "", "", "")

	var inputEnvs []string
	for _, e := range env {
		if strings.HasPrefix(e, "INPUT_") {
			inputEnvs = append(inputEnvs, e)
		}
	}
	if len(inputEnvs) != 2 {
		t.Fatalf("expected 2 INPUT_ env vars, got %d: %v", len(inputEnvs), inputEnvs)
	}

	// Check TARGET is uppercased.
	for _, e := range inputEnvs {
		if strings.HasPrefix(e, "INPUT_TARGET=") && e != "INPUT_TARGET=example.com" {
			t.Fatalf("INPUT_TARGET wrong: %q", e)
		}
		if strings.HasPrefix(e, "INPUT_SEVERITY=") && e != "INPUT_SEVERITY=high" {
			t.Fatalf("INPUT_SEVERITY wrong: %q", e)
		}
	}
}

// --- Connector address resolution (auto-derive WORKER_GRPC_ADDR) ---

// stubInspector implements dockerInspector with canned responses.
// Unconfigured handlers report an error, so tests can assert a code path was
// NOT taken by registering handlers that t.Fatal on invocation.
type stubInspector struct {
	containerInspect func(ctx context.Context, id string) (types.ContainerJSON, error)
	networkInspect   func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error)
	serverVersion    func(ctx context.Context) (types.Version, error)
}

func (s *stubInspector) ContainerInspect(ctx context.Context, id string) (types.ContainerJSON, error) {
	if s.containerInspect == nil {
		return types.ContainerJSON{}, errors.New("stub: ContainerInspect not configured")
	}
	return s.containerInspect(ctx, id)
}

func (s *stubInspector) NetworkInspect(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
	if s.networkInspect == nil {
		return types.NetworkResource{}, errors.New("stub: NetworkInspect not configured")
	}
	return s.networkInspect(ctx, id, opts)
}

func (s *stubInspector) ServerVersion(ctx context.Context) (types.Version, error) {
	if s.serverVersion == nil {
		return types.Version{}, errors.New("stub: ServerVersion not configured")
	}
	return s.serverVersion(ctx)
}

func mustResolveConnectorAddr(t *testing.T, di dockerInspector, hostname, override string, port int, goos string) string {
	t.Helper()
	addr, err := resolveConnectorAddr(context.Background(), di, hostname, override, port, goos)
	if err != nil {
		t.Fatalf("resolveConnectorAddr: %v", err)
	}
	return addr
}

// Regression: cfg.ConnectorAddr "0.0.0.0:50051" used to leak verbatim into
// containers, and 0.0.0.0 from inside a container resolves to its own loopback.
func TestResolveConnectorAddrExplicitOverride(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			t.Fatal("override must win: ContainerInspect must not be called")
			return types.ContainerJSON{}, nil
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			t.Fatal("override must win: NetworkInspect must not be called")
			return types.NetworkResource{}, nil
		},
	}
	got := mustResolveConnectorAddr(t, di, "deadbeef", "10.0.0.9:9999", 50051, "linux")
	if got != "10.0.0.9:9999" {
		t.Fatalf("override = %q, want %q", got, "10.0.0.9:9999")
	}
}

// Worker itself running inside docker (e.g. compose): its container is
// inspectable by hostname and reachable from spawned containers (nil network =
// default bridge) via its bridge IP.
func TestResolveConnectorAddrSelfContainer(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			if id != "worker-container-id" {
				t.Fatalf("ContainerInspect(%q), want hostname %q", id, "worker-container-id")
			}
			return types.ContainerJSON{
				NetworkSettings: &types.NetworkSettings{
					Networks: map[string]*network.EndpointSettings{
						"bridge": {IPAddress: "172.18.0.3"},
					},
				},
			}, nil
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			t.Fatal("self IP found: NetworkInspect must not be called")
			return types.NetworkResource{}, nil
		},
	}
	got := mustResolveConnectorAddr(t, di, "worker-container-id", "", 50051, "linux")
	if got != "172.18.0.3:50051" {
		t.Fatalf("self-container addr = %q, want %q", got, "172.18.0.3:50051")
	}
}

// Docker Desktop (windows/darwin) exposes the host via host.docker.internal —
// built-in name, no host-gateway ExtraHosts needed, so ServerVersion is never
// consulted on these OSes.
func TestResolveConnectorAddrDockerDesktop(t *testing.T) {
	for _, goos := range []string{"windows", "darwin"} {
		di := &stubInspector{
			containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
				return types.ContainerJSON{}, errors.New("hostname is not a container")
			},
			serverVersion: func(ctx context.Context) (types.Version, error) {
				t.Fatal("desktop host.docker.internal is built-in: ServerVersion must not be called")
				return types.Version{}, nil
			},
		}
		got := mustResolveConnectorAddr(t, di, "my-laptop", "", 50051, goos)
		if got != "host.docker.internal:50051" {
			t.Fatalf("goos %s: addr = %q, want %q", goos, got, "host.docker.internal:50051")
		}
	}
}

// Linux native docker pre-dating host-gateway support (API < 1.41 / Engine <
// 20.10): no host.docker.internal mapping can be added, so spawned containers
// on the bridge network dial the bridge gateway, whose address is reachable
// from them.
func TestResolveConnectorAddrLinuxBridgeGateway(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			return types.ContainerJSON{}, errors.New("hostname is not a container")
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			if id != "bridge" {
				t.Fatalf("NetworkInspect(%q), want %q", id, "bridge")
			}
			return types.NetworkResource{
				IPAM: network.IPAM{Config: []network.IPAMConfig{{Gateway: "172.18.0.1"}}},
			}, nil
		},
		serverVersion: func(ctx context.Context) (types.Version, error) {
			return types.Version{APIVersion: "1.40"}, nil
		},
	}
	got := mustResolveConnectorAddr(t, di, "my-server", "", 50051, "linux")
	if got != "172.18.0.1:50051" {
		t.Fatalf("bridge gateway addr = %q, want %q", got, "172.18.0.1:50051")
	}
}

// Linux, engine version unreadable and bridge network uninspectable → default
// gateway fallback (host-gateway support cannot be assumed).
func TestResolveConnectorAddrLinuxFallback(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			return types.ContainerJSON{}, errors.New("hostname is not a container")
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			return types.NetworkResource{}, errors.New("bridge network not found")
		},
	}
	got := mustResolveConnectorAddr(t, di, "my-server", "", 50051, "linux")
	if got != "172.17.0.1:50051" {
		t.Fatalf("fallback addr = %q, want %q", got, "172.17.0.1:50051")
	}
}

// The address stored on the runtime (resolved at construction) is what lands in
// WORKER_GRPC_ADDR — never the old raw 0.0.0.0 default.
func TestBuildContainerEnvUsesResolvedAddr(t *testing.T) {
	r := NewDockerRuntimeWithClient(nil, "172.18.0.3:50051", "tok")
	env := buildContainerEnv(JobSpec{JobID: "j-1", Tool: "nuclei", TraceID: "t-1"}, r.connectorAddr, r.connectorToken, "e-1")

	found := false
	for _, e := range env {
		if strings.HasPrefix(e, "WORKER_GRPC_ADDR=") {
			found = true
			if e != "WORKER_GRPC_ADDR=172.18.0.3:50051" {
				t.Fatalf("WORKER_GRPC_ADDR = %q, want resolved addr %q", e, "WORKER_GRPC_ADDR=172.18.0.3:50051")
			}
		}
		if strings.Contains(e, "0.0.0.0") {
			t.Fatalf("container env must not contain 0.0.0.0 (unreachable from containers), got %q", e)
		}
	}
	if !found {
		t.Fatal("WORKER_GRPC_ADDR missing from container env")
	}
}

// Source guard (established style in this file): the bad hardcoded default must
// never sneak back in.
func TestDockerRuntimeNoHardcodedZeroAddr(t *testing.T) {
	data, err := os.ReadFile("docker.go")
	if err != nil {
		t.Fatalf("read docker.go: %v", err)
	}
	if strings.Contains(string(data), "0.0.0.0:50051") {
		t.Fatal("docker.go must not hardcode 0.0.0.0:50051 — connector addr must be auto-derived")
	}
}

// --- lifecycle logging ---

// captureLogger records Info/Warning lines for asserting runtime logs.
type captureLogger struct {
	mu     sync.Mutex
	levels []string
	lines  []string
}

func (c *captureLogger) Info(msg string, args ...any) { c.add("info", msg, args...) }
func (c *captureLogger) Warning(msg string, args ...any) {
	c.add("warning", msg, args...)
}

func (c *captureLogger) add(level, msg string, args ...any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.levels = append(c.levels, level)
	c.lines = append(c.lines, fmt.Sprintf(msg, args...))
}

func (c *captureLogger) all() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	cp := make([]string, len(c.lines))
	copy(cp, c.lines)
	return cp
}

func (c *captureLogger) find(substr string) (string, bool) {
	for _, l := range c.all() {
		if strings.Contains(l, substr) {
			return l, true
		}
	}
	return "", false
}

// fakeDockerEngine is a minimal Docker Engine API server covering the
// endpoints DockerRuntime.Create/Stop/Cleanup touch. It uses a fixed API
// version on the client side, so no version negotiation or /_ping is needed.
type fakeDockerEngine struct {
	mu             sync.Mutex
	containerID    string
	pulled         int
	created        int
	started        int
	stopped        int
	removed        int
	removeErr      error
	running        bool // container state as the engine sees it
	createBody     string
	createName     string            // name of the most recent create attempt
	createNames    []string          // every create attempt name, in order
	createConflict bool              // fail the next create with HTTP 409, then clear
	health         string            // State.Health.Status, "" = no healthcheck
	exitCode       int               // State.ExitCode
	logOutput      string            // payload for the container logs stream
	labels         map[string]string // Config.Labels of the created container (pooled-name reuse checks oasm-managed)
	exists         bool              // a container currently exists in the engine (inspect/list 404 when false)
}

func newFakeDockerEngine() *fakeDockerEngine {
	return &fakeDockerEngine{
		containerID: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
	}
}

func (f *fakeDockerEngine) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// The docker client bakes the API version into the path (/v1.44/...).
		const vPrefix = "/v1.44"
		path := r.URL.Path
		if strings.HasPrefix(path, vPrefix) {
			path = strings.TrimPrefix(path, vPrefix)
		}
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(path, "/images/create"):
			f.mu.Lock()
			f.pulled++
			f.mu.Unlock()
			w.WriteHeader(http.StatusOK)
			fmt.Fprint(w, `{"status":"pull complete"}`)
		case r.Method == http.MethodPost && path == "/containers/create":
			body, _ := io.ReadAll(r.Body)
			f.mu.Lock()
			f.created++
			id := f.containerID
			f.createBody = string(body)
			f.createName = r.URL.Query().Get("name")
			f.createNames = append(f.createNames, f.createName)
			conflict := f.createConflict
			f.createConflict = false
			var createReq struct {
				Labels map[string]string `json:"Labels"`
			}
			_ = json.Unmarshal(body, &createReq)
			f.labels = createReq.Labels
			f.exists = true
			f.mu.Unlock()
			if conflict {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				fmt.Fprint(w, `{"message":"Conflict. The container name is already in use"}`)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			fmt.Fprintf(w, `{"Id":%q}`, id)
		case r.Method == http.MethodPost && strings.HasPrefix(path, "/containers/") && strings.HasSuffix(path, "/start"):
			f.mu.Lock()
			f.started++
			f.running = true
			f.mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodPost && strings.HasPrefix(path, "/containers/") && strings.HasSuffix(path, "/stop"):
			f.mu.Lock()
			f.stopped++
			f.running = false
			f.mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && path == "/containers/json":
			// ContainerList view used by SweepOrphans (label-filtered). Must be
			// matched before the /containers/<id>/json prefix case below.
			f.mu.Lock()
			labels := f.labels
			exists := f.exists
			id := f.containerID
			f.mu.Unlock()
			list := []types.Container{}
			if exists && labels["oasm-managed"] == "true" {
				list = append(list, types.Container{ID: id, Labels: labels})
			}
			_ = json.NewEncoder(w).Encode(list)
		case r.Method == http.MethodGet && strings.HasPrefix(path, "/containers/") && strings.HasSuffix(path, "/json"):
			f.mu.Lock()
			running := f.running
			id := f.containerID
			health := f.health
			exitCode := f.exitCode
			labels := f.labels
			f.mu.Unlock()
			healthJSON := ""
			if health != "" {
				healthJSON = fmt.Sprintf(`,"Health":{"Status":%q}`, health)
			}
			labelsJSON := "null"
			if len(labels) > 0 {
				b, _ := json.Marshal(labels)
				labelsJSON = string(b)
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"Id":%q,"State":{"Running":%t,"ExitCode":%d%s},"Config":{"Labels":%s}}`, id, running, exitCode, healthJSON, labelsJSON)
		case r.Method == http.MethodGet && strings.HasPrefix(path, "/containers/") && strings.HasSuffix(path, "/logs"):
			// ContainerLogs with ShowStdout+ShowStderr returns a multiplexed
			// stream: 8-byte header (stream byte + uint32 BE length) + payload.
			f.mu.Lock()
			out := f.logOutput
			f.mu.Unlock()
			hdr := make([]byte, 8)
			hdr[0] = 1 // stdout
			binary.BigEndian.PutUint32(hdr[4:], uint32(len(out)))
			w.Header().Set("Content-Type", "application/vnd.docker.raw-stream")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(hdr)
			_, _ = w.Write([]byte(out))
			if fl, ok := w.(http.Flusher); ok {
				fl.Flush()
			}
			// Follow:true — hold the stream open until the client goes away.
			<-r.Context().Done()
		case r.Method == http.MethodDelete && strings.HasPrefix(path, "/containers/"):
			f.mu.Lock()
			f.removed++
			removeErr := f.removeErr
			f.mu.Unlock()
			if removeErr != nil {
				http.Error(w, removeErr.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(w, r)
		}
	}
}

// newFakeDockerRuntime spins up the fake engine and returns a runtime bound to
// it with the given capture logger wired.
func newFakeDockerRuntime(t *testing.T, engine *fakeDockerEngine, log *captureLogger) *DockerRuntime {
	t.Helper()
	ts := httptest.NewServer(engine.handler())
	t.Cleanup(ts.Close)
	cli, err := client.NewClientWithOpts(client.WithHost(ts.URL), client.WithVersion("1.44"))
	if err != nil {
		t.Fatalf("docker client: %v", err)
	}
	r := NewDockerRuntimeWithClient(cli, "172.18.0.3:50051", "tok")
	r.SetLogger(log)
	return r
}

func TestCreateLogsLifecycleSteps(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	h, err := r.Create(context.Background(), JobSpec{
		Tool:    "nuclei",
		Image:   "ghcr.io/open-asm/nuclei:1.0",
		JobID:   "job-1",
		TraceID: "tr-1",
	}, RuntimeOpts{})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if h.ID == "" || h.ID != engine.containerID {
		t.Fatalf("unexpected container ID %q, want %q", h.ID, engine.containerID)
	}

	lines := log.all()
	if len(lines) != 3 {
		t.Fatalf("expected exactly 3 lifecycle log lines, got %d: %v", len(lines), lines)
	}

	// 1: image pull done.
	if !strings.Contains(lines[0], "docker: image pull done:") || !strings.Contains(lines[0], "ghcr.io/open-asm/nuclei:1.0") {
		t.Fatalf("pull line = %q", lines[0])
	}
	// 2: container created — carries exec/job/tool/grpc identity.
	for _, want := range []string{
		"docker: container created:", "exec=", "job=job-1", "tool=nuclei", "grpc=172.18.0.3:50051",
	} {
		if !strings.Contains(lines[1], want) {
			t.Fatalf("created line %q missing %q", lines[1], want)
		}
	}
	// 3: container started — same exec identity as created.
	if !strings.Contains(lines[2], "docker: container started:") || !strings.Contains(lines[2], "job=job-1") {
		t.Fatalf("started line = %q", lines[2])
	}
	execOf := func(line string) string {
		start := strings.Index(line, "exec=")
		if start < 0 {
			return ""
		}
		rest := line[start+len("exec="):]
		if i := strings.Index(rest, " "); i >= 0 {
			rest = rest[:i]
		}
		return rest
	}
	if execOf(lines[1]) == "" || execOf(lines[1]) != execOf(lines[2]) {
		t.Fatalf("started line must reuse the created exec identity: %q vs %q", lines[1], lines[2])
	}
	execID := execOf(lines[2])
	if len(execID) != 32 {
		t.Fatalf("exec identity %q must be a 32-hex execution id", execID)
	}

	// Engine received exactly one of each call.
	if engine.pulled != 1 || engine.created != 1 || engine.started != 1 {
		t.Fatalf("engine calls: pulled=%d created=%d started=%d, want 1 each", engine.pulled, engine.created, engine.started)
	}
}

func TestStopLogsStoppingContainer(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	if err := r.Cancel(context.Background(), Handle{ID: engine.containerID}); err != nil {
		t.Fatalf("Cancel: %v", err)
	}

	line, ok := log.find("docker: stopping container")
	if !ok {
		t.Fatalf("expected 'docker: stopping container' log, got %v", log.all())
	}
	if !strings.Contains(line, engine.containerID) {
		t.Fatalf("stopping line must carry the container ID: %q", line)
	}
	if engine.stopped != 1 {
		t.Fatalf("expected 1 stop call, got %d", engine.stopped)
	}
}

func TestCleanupLogsRemoveFailureAsWarning(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.removeErr = errors.New("container already gone")
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	// Cleanup must keep its nil-error contract even when remove fails.
	if err := r.Cleanup(context.Background(), Handle{ID: engine.containerID}); err != nil {
		t.Fatalf("Cleanup must still return nil on remove error, got %v", err)
	}

	line, ok := log.find("docker: removed container")
	if !ok {
		t.Fatalf("expected 'docker: removed container' log, got %v", log.all())
	}
	if !strings.Contains(line, "container already gone") {
		t.Fatalf("remove-failure warning must include the error: %q", line)
	}
	if len(log.levels) != 1 || log.levels[0] != "warning" {
		t.Fatalf("remove failure must be logged as warning, got %v", log.levels)
	}
	if engine.removed != 1 {
		t.Fatalf("expected 1 remove call, got %d", engine.removed)
	}
}

func TestCleanupLogsSuccessfulRemove(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	if err := r.Cleanup(context.Background(), Handle{ID: engine.containerID}); err != nil {
		t.Fatalf("Cleanup: %v", err)
	}

	line, ok := log.find("docker: removed container")
	if !ok {
		t.Fatalf("expected 'docker: removed container' log, got %v", log.all())
	}
	if !strings.Contains(line, engine.containerID) {
		t.Fatalf("removed line must carry the container ID: %q", line)
	}
}

// Create must prefer the execID passed in the spec (Manager's exec-N) over a
// freshly generated hex id, so EXECUTION_ID in the container env matches the
// ID the proxy queues ExecuteJob under — otherwise the pending job never
// flushes on connector registration.
func TestCreateUsesPassedExecID(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	h, err := r.Create(context.Background(), JobSpec{
		Tool:   "nuclei",
		Image:  "ghcr.io/open-asm/nuclei:1.0",
		JobID:  "job-1",
		ExecID: "exec-7",
	}, RuntimeOpts{})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Log lines must carry the passed-in execID, not a random hex.
	for _, line := range log.all() {
		if strings.Contains(line, "exec=") && !strings.Contains(line, "exec=exec-7") {
			t.Fatalf("lifecycle log must carry exec=exec-7, got %q", line)
		}
	}

	// EXECUTION_ID env must be the passed-in ID (env entries serialize as K=V).
	if !strings.Contains(engine.createBody, `"EXECUTION_ID=exec-7"`) {
		t.Fatalf("create body must set EXECUTION_ID=exec-7, got %s", engine.createBody)
	}

	// Handle carries the exec id label for debugging.
	if h.Labels["exec_id"] != "exec-7" {
		t.Fatalf("expected Handle label exec_id=exec-7, got %v", h.Labels)
	}
}

// DockerRuntime.Start must be idempotent: Create already starts the container,
// and Manager.Submit calls Start right after Create. A second ContainerStart on
// a running container (double-start) must be skipped.
func TestStartIdempotentWhenAlreadyRunning(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	// Create starts the container (engine.running becomes true).
	h, err := r.Create(context.Background(), JobSpec{
		Tool:  "nuclei",
		Image: "ghcr.io/open-asm/nuclei:1.0",
		JobID: "job-1",
	}, RuntimeOpts{})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// The Manager-level second Start must be a no-op.
	if err := r.Start(context.Background(), h); err != nil {
		t.Fatalf("Start on a running container must not error: %v", err)
	}
	if engine.started != 1 {
		t.Fatalf("expected exactly 1 start call (from Create), got %d — double-start", engine.started)
	}
}

// A container that is NOT running must still be started by Start (inspect
// first, start when stopped).
func TestStartStartsStoppedContainer(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	// Container exists but was never started.
	if err := r.Start(context.Background(), Handle{ID: engine.containerID}); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if engine.started != 1 {
		t.Fatalf("expected 1 start call on a stopped container, got %d", engine.started)
	}
}

// Inspect must surface the container's health state and exit code so the
// worker health monitor can detect unhealthy / crashed containers.
func TestInspectReadsHealthAndExitCode(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.health = "unhealthy"
	engine.exitCode = 42
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	res, err := r.Inspect(context.Background(), Handle{ID: engine.containerID})
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if res.Health != "unhealthy" {
		t.Fatalf("expected Health=unhealthy, got %q", res.Health)
	}
	if res.ExitCode != 42 {
		t.Fatalf("expected ExitCode=42, got %d", res.ExitCode)
	}

	// A container without a healthcheck must report empty Health (unknown).
	engine.health = ""
	res, err = r.Inspect(context.Background(), Handle{ID: engine.containerID})
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if res.Health != "" {
		t.Fatalf("expected empty Health without healthcheck, got %q", res.Health)
	}
}

// Logs must stream the container log (multiplexed stdout+stderr demuxed into
// lines) until the context is cancelled.
func TestLogsStreamsContainerLines(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.logOutput = "nuclei: scan started\nnuclei: probe 443 open\n"
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := r.Logs(ctx, Handle{ID: engine.containerID})
	if err != nil {
		t.Fatalf("Logs: %v", err)
	}

	got := []string{}
	deadline := time.After(3 * time.Second)
	for len(got) < 2 {
		select {
		case line, ok := <-ch:
			if !ok {
				t.Fatalf("logs channel closed before all lines arrived, got %v", got)
			}
			got = append(got, string(line))
		case <-deadline:
			t.Fatalf("timeout waiting for log lines, got %v", got)
		}
	}
	if got[0] != "nuclei: scan started" || got[1] != "nuclei: probe 443 open" {
		t.Fatalf("unexpected log lines: %v", got)
	}

	// Cancelling the context must close the stream (no goroutine leak).
	cancel()
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected channel closed after ctx cancel")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("logs channel did not close after ctx cancel")
	}
}

// Logs must terminate the stream when the context is cancelled even when the
// container never produces output.
func TestLogsStopsOnContextCancel(t *testing.T) {
	engine := newFakeDockerEngine() // no logOutput: stream holds open (follow)
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	ctx, cancel := context.WithCancel(context.Background())
	ch, err := r.Logs(ctx, Handle{ID: engine.containerID})
	if err != nil {
		t.Fatalf("Logs: %v", err)
	}

	cancel()
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected channel closed after ctx cancel")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("logs channel did not close after ctx cancel")
	}
}

// dockerNameRe is Docker's container name charset: alphanumeric start, then
// [a-zA-Z0-9_.-].
var dockerNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`)

// Docker Engine 27+ assigns the default bridge an IPv6 ULA (fdc4:...) in
// addition to the IPv4 gateway. Containers on the bridge have no IPv6 route, so
// on engines without host-gateway support (API < 1.41) auto-derive must pick
// the IPv4 gateway even when IPv6 entries sort first in IPAM.Config.
func TestResolvePrefersIPv4Gateway(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			return types.ContainerJSON{}, errors.New("hostname is not a container")
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			return types.NetworkResource{
				IPAM: network.IPAM{Config: []network.IPAMConfig{
					{Gateway: "fdc4:f303:9324::254"}, // IPv6 ULA — first, unreachable from containers
					{Gateway: "172.18.0.1"},
				}},
			}, nil
		},
		serverVersion: func(ctx context.Context) (types.Version, error) {
			return types.Version{APIVersion: "1.40"}, nil
		},
	}
	got := mustResolveConnectorAddr(t, di, "my-server", "", 50051, "linux")
	if got != "172.18.0.1:50051" {
		t.Fatalf("bridge gateway addr = %q, want IPv4 %q (not IPv6 %q)", got, "172.18.0.1:50051", "[fdc4:f303:9324::254]:50051")
	}
}

// An IPv6-only bridge gateway must never be auto-selected — the container
// cannot route to it ("network is unreachable"). The only supported IPv6 dial
// path is an explicit override, which is used as-is (precedence rule 1).
// Exercised here on an engine without host-gateway support so the gateway
// chain is what resolves.
func TestResolveSkipsIPv6UnlessExplicitOverride(t *testing.T) {
	di6 := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			return types.ContainerJSON{}, errors.New("hostname is not a container")
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			return types.NetworkResource{
				IPAM: network.IPAM{Config: []network.IPAMConfig{{Gateway: "fdc4:f303:9324::254"}}},
			}, nil
		},
		serverVersion: func(ctx context.Context) (types.Version, error) {
			return types.Version{APIVersion: "1.40"}, nil
		},
	}
	got := mustResolveConnectorAddr(t, di6, "my-server", "", 50051, "linux")
	if got != "172.17.0.1:50051" {
		t.Fatalf("IPv6-only gateway must not be auto-selected: got %q, want %q", got, "172.17.0.1:50051")
	}

	// Explicit override (as-is, no port re-writing) still wins.
	got = mustResolveConnectorAddr(t, di6, "my-server", "[fdc4:f303:9324::254]:50051", 50051, "linux")
	if got != "[fdc4:f303:9324::254]:50051" {
		t.Fatalf("explicit IPv6 override must be used as-is, got %q", got)
	}
}

// supportsHostGateway: only API >= 1.41 (Docker Engine 20.10+) resolves the
// special host-gateway value in ExtraHosts. Anything unreadable is treated as
// unsupported so the caller falls back to the bridge gateway.
func TestSupportsHostGateway(t *testing.T) {
	cases := []struct {
		api  string
		want bool
	}{
		{"1.40", false},   // Engine 19.03 — pre-host-gateway
		{"1.41", true},    // Engine 20.10 — host-gateway introduced
		{"1.44", true},    // modern
		{"2.0", true},     // future API major
		{"", false},       // unreadable
		{"1.4", false},    // incomplete minor
		{"1.41.0", false}, // non-canonical form, treated conservatively
	}
	for _, c := range cases {
		if got := supportsHostGateway(c.api); got != c.want {
			t.Fatalf("supportsHostGateway(%q) = %t, want %t", c.api, got, c.want)
		}
	}
}

// Host-terminal linux worker on a host-gateway-capable engine (API >= 1.41):
// resolveConnectorAddr returns the stable host.docker.internal name — the
// mapping is guaranteed by the host-gateway ExtraHosts entry Create adds, so
// no bridge inspection is needed.
func TestResolveConnectorAddrLinuxHostTerminalUsesHostGateway(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (types.ContainerJSON, error) {
			return types.ContainerJSON{}, errors.New("hostname is not a container")
		},
		networkInspect: func(ctx context.Context, id string, opts types.NetworkInspectOptions) (types.NetworkResource, error) {
			t.Fatal("host.docker.internal wins: NetworkInspect must not be called")
			return types.NetworkResource{}, nil
		},
		serverVersion: func(ctx context.Context) (types.Version, error) {
			return types.Version{APIVersion: "1.41"}, nil
		},
	}
	got := mustResolveConnectorAddr(t, di, "my-server", "", 50051, "linux")
	if got != "host.docker.internal:50051" {
		t.Fatalf("linux host-terminal addr = %q, want %q", got, "host.docker.internal:50051")
	}
}

func TestCreateUsesOasmPrefixName(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:   "Nuclei Scanner",
		Image:  "ghcr.io/open-asm/nuclei:1.0",
		JobID:  "job-1",
		ExecID: "exec-7",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	name := engine.createName
	if !strings.HasPrefix(name, "oasm-") {
		t.Fatalf("container name %q must start with oasm-", name)
	}
	if !dockerNameRe.MatchString(name) {
		t.Fatalf("container name %q violates Docker name charset %s", name, dockerNameRe)
	}
	if !strings.Contains(name, "nuclei-scanner") {
		t.Fatalf("container name %q must contain the sanitized tool name", name)
	}
	if !strings.Contains(name, "exec-7") {
		t.Fatalf("container name %q must contain the short exec id", name)
	}
}

// Every connector container must carry the host.docker.internal:host-gateway
// ExtraHosts entry so the auto-derived dial address resolves on Linux hosts
// (Engine 20.10+ maps host-gateway to the host). Docker Desktop already maps
// the name; the extra entry is harmless there, so it is added unconditionally.
func TestCreateAddsHostGatewayExtraHosts(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:  "nuclei",
		Image: "ghcr.io/open-asm/nuclei:1.0",
		JobID: "job-1",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if !strings.Contains(engine.createBody, "ExtraHosts") {
		t.Fatalf("create body must include ExtraHosts, got: %s", engine.createBody)
	}
	if !strings.Contains(engine.createBody, "host.docker.internal:host-gateway") {
		t.Fatalf("create body must map host.docker.internal to host-gateway, got: %s", engine.createBody)
	}
}

// A 409 Conflict on create (stale container holding the tool/exec name) must
// retry once with a fresh random suffix and succeed.
func TestCreateRetriesOn409NameConflict(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.createConflict = true // first create fails with 409
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)

	h, err := r.Create(context.Background(), JobSpec{
		Tool:   "nuclei",
		Image:  "ghcr.io/open-asm/nuclei:1.0",
		JobID:  "job-1",
		ExecID: "exec-7",
	}, RuntimeOpts{})
	if err != nil {
		t.Fatalf("Create with name conflict must retry and succeed: %v", err)
	}
	if engine.created != 2 {
		t.Fatalf("expected 2 create calls (1 conflict + 1 retry), got %d", engine.created)
	}
	if h.ID != engine.containerID {
		t.Fatalf("unexpected container ID %q, want %q", h.ID, engine.containerID)
	}
	if len(engine.createNames) != 2 {
		t.Fatalf("expected 2 recorded names, got %v", engine.createNames)
	}
	for _, n := range engine.createNames {
		if !strings.HasPrefix(n, "oasm-") || !dockerNameRe.MatchString(n) {
			t.Fatalf("bad retry name %q", n)
		}
	}
	if engine.createNames[0] == engine.createNames[1] {
		t.Fatalf("retry must use a fresh random suffix, both attempts named %q", engine.createNames[0])
	}
	if engine.started != 1 {
		t.Fatalf("expected container to start once after successful create, got %d", engine.started)
	}
}

// The explicit connectorAddr must flow from NewDockerRuntime into the dial
// address containers use. client.go passes cfg.ConnectorAddr (populated from
// WORKER_CONNECTOR_ADDR by viper); previously only the process env was read.
// NewDockerRuntime builds a lazy client and resolves the override before any
// daemon call, so this works without a Docker engine.
func TestConnectorAddrOverridePlumbing(t *testing.T) {
	t.Setenv("WORKER_CONNECTOR_ADDR", "") // isolate the explicit-arg path
	d, err := NewDockerRuntime("", "10.0.0.9:9999", 50051, "tok")
	if err != nil {
		t.Fatalf("NewDockerRuntime: %v", err)
	}
	if d.connectorAddr != "10.0.0.9:9999" {
		t.Fatalf("connectorAddr = %q, want explicit arg %q", d.connectorAddr, "10.0.0.9:9999")
	}
}

// Precedence: an empty connectorAddr arg falls back to the WORKER_CONNECTOR_ADDR
// env (standalone runtime users). Config arg > env > auto-derive.
func TestConnectorAddrEnvFallbackWhenArgEmpty(t *testing.T) {
	t.Setenv("WORKER_CONNECTOR_ADDR", "192.168.1.50:50051")
	d, err := NewDockerRuntime("", "", 50051, "tok")
	if err != nil {
		t.Fatalf("NewDockerRuntime: %v", err)
	}
	if d.connectorAddr != "192.168.1.50:50051" {
		t.Fatalf("connectorAddr = %q, want env override %q", d.connectorAddr, "192.168.1.50:50051")
	}
}

// --- container pool (per-tool reuse) ---

// The pooled container name must be deterministic per (tool, image) and carry
// the 8-hex sha256 hash of the image as its disambiguating suffix.
func TestBuildPoolContainerNameDeterministic(t *testing.T) {
	n1 := buildPoolContainerName("nuclei", "ghcr.io/open-asm/nuclei:1.0")
	n2 := buildPoolContainerName("nuclei", "ghcr.io/open-asm/nuclei:1.0")
	if n1 != n2 {
		t.Fatalf("same tool+image must produce the same name, got %q and %q", n1, n2)
	}
	if !regexp.MustCompile(`^oasm-nuclei-[0-9a-f]{8}$`).MatchString(n1) {
		t.Fatalf("name %q must match oasm-<tool>-<hash8>", n1)
	}
	if other := buildPoolContainerName("nuclei", "ghcr.io/open-asm/nuclei:2.0"); other == n1 {
		t.Fatal("different images must produce different pool names")
	}
}

// Pooled Create: the second same-image create reuses the live running
// container — no extra pull, no extra create, same handle ID.
func TestCreatePoolReusesRunningContainer(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)
	r.SetPoolEnabled(true)

	spec := JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0", JobID: "job-1", TraceID: "tr-1"}
	h1, err := r.Create(context.Background(), spec, RuntimeOpts{})
	if err != nil {
		t.Fatalf("first Create: %v", err)
	}
	h2, err := r.Create(context.Background(), spec, RuntimeOpts{})
	if err != nil {
		t.Fatalf("second Create: %v", err)
	}
	if h1.ID != h2.ID {
		t.Fatalf("pooled reuse must return the same container, got %q and %q", h1.ID, h2.ID)
	}
	if engine.created != 1 {
		t.Fatalf("expected 1 container create for 2 pooled submits, got %d", engine.created)
	}
	if engine.pulled != 1 {
		t.Fatalf("reuse must skip the image pull, pulled=%d", engine.pulled)
	}
	if _, ok := log.find("pool hit, reusing running container"); !ok {
		t.Fatalf("expected a pool-hit log line, got %v", log.all())
	}
}

// A pooled container that exited is retired on the next same-image create:
// removed, then created fresh under the same stable name.
func TestCreatePoolRetiresExitedContainerBeforeRecreate(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)
	r.SetPoolEnabled(true)

	spec := JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0", JobID: "job-1"}
	if _, err := r.Create(context.Background(), spec, RuntimeOpts{}); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	engine.mu.Lock()
	engine.running = false // container exited after its job
	engine.mu.Unlock()

	if _, err := r.Create(context.Background(), spec, RuntimeOpts{}); err != nil {
		t.Fatalf("second Create must fall back to a fresh container: %v", err)
	}
	if engine.created != 2 {
		t.Fatalf("expected a fresh create after the pooled container exited, got %d", engine.created)
	}
	if engine.removed != 1 {
		t.Fatalf("exited stale pooled container must be removed, removed=%d", engine.removed)
	}
	if len(engine.createNames) != 2 || engine.createNames[0] != engine.createNames[1] {
		t.Fatalf("both creates must use the same stable pool name, got %v", engine.createNames)
	}
}

// A 409 conflict under pooled naming resolves to reuse (sibling created the
// container) or stale-removal+retry — never a random fresh name.
func TestCreatePool409ConflictKeepsStableName(t *testing.T) {
	engine := newFakeDockerEngine()
	engine.createConflict = true // first create attempt fails with 409
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)
	r.SetPoolEnabled(true)

	if _, err := r.Create(context.Background(), JobSpec{
		Tool:  "nuclei",
		Image: "ghcr.io/open-asm/nuclei:1.0",
		JobID: "job-1",
	}, RuntimeOpts{}); err != nil {
		t.Fatalf("Create with pool 409 must retry and succeed: %v", err)
	}
	if engine.created != 2 {
		t.Fatalf("expected 2 create calls (409 + retry), got %d", engine.created)
	}
	if len(engine.createNames) != 2 || engine.createNames[0] != engine.createNames[1] {
		t.Fatalf("pooled mode must retry under the SAME stable name, got %v", engine.createNames)
	}
}

// SweepOrphans removes oasm-managed containers the pool does not reference and
// leaves referenced ones alone; pooling disabled sweeps nothing.
func TestSweepOrphansRemovesUnreferencedContainers(t *testing.T) {
	engine := newFakeDockerEngine()
	log := &captureLogger{}
	r := newFakeDockerRuntime(t, engine, log)
	r.SetPoolEnabled(true)

	h, err := r.Create(context.Background(), JobSpec{
		Tool:  "nuclei",
		Image: "ghcr.io/open-asm/nuclei:1.0",
		JobID: "job-1",
	}, RuntimeOpts{})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	kept, err := r.SweepOrphans(context.Background(), []string{h.ID})
	if err != nil {
		t.Fatalf("SweepOrphans(keep): %v", err)
	}
	if kept != 0 {
		t.Fatalf("referenced container must be kept, removed=%d", kept)
	}
	if engine.removed != 0 {
		t.Fatalf("no removal expected for kept container, removed=%d", engine.removed)
	}

	removed, err := r.SweepOrphans(context.Background(), nil)
	if err != nil {
		t.Fatalf("SweepOrphans(nil): %v", err)
	}
	if removed != 1 {
		t.Fatalf("unreferenced managed container must be removed, removed=%d", removed)
	}

	// Pooling disabled: nothing is managed, sweep is a no-op.
	r2 := newFakeDockerRuntime(t, newFakeDockerEngine(), &captureLogger{})
	n, err := r2.SweepOrphans(context.Background(), nil)
	if err != nil {
		t.Fatalf("SweepOrphans disabled: %v", err)
	}
	if n != 0 {
		t.Fatalf("disabled pool must sweep nothing, removed=%d", n)
	}
}
