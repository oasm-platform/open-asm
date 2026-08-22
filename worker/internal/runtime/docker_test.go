package runtime

import (
	"context"
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
