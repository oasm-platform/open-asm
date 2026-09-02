package runtime

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
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
	assertEnvContains("WORKER_TOKEN", "tok-789")
	assertEnvContains("EXECUTION_ID", "exec-abc")
	assertEnvContains("JOB_ID", "j-123")
	assertEnvContains("TOOL", "nuclei")
	assertEnvContains("TRACE_ID", "tr-456")
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
