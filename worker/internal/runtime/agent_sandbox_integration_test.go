package runtime

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/docker/docker/client"
)

// Real-engine check of the sandbox. Opt-in (OASM_SANDBOX_IT=1) because it
// needs a Docker engine and the sandbox image (OASM_SANDBOX_IT_IMAGE,
// default oasm/oasm-worker:latest) locally.
func TestAgentSandboxIntegration(t *testing.T) {
	if os.Getenv("OASM_SANDBOX_IT") != "1" {
		t.Skip("set OASM_SANDBOX_IT=1 to run against a real Docker engine")
	}
	image := os.Getenv("OASM_SANDBOX_IT_IMAGE")
	if image == "" {
		image = agentSandboxDefaultImage
	}
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		t.Fatalf("docker client: %v", err)
	}
	toolDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(toolDir, "hello-tool"), []byte("#!/bin/sh\necho tool-ok\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("WORKER_API_KEY", "must-not-leak")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	sb, err := NewAgentSandbox(ctx, NewDockerRuntimeWithClient(cli, "", ""), AgentSandboxOptions{
		Image:    image,
		ToolPath: toolDir,
		OwnerID:  func() string { return "it-owner" },
	})
	if err != nil {
		t.Fatalf("NewAgentSandbox: %v", err)
	}
	const sid = "it-session"
	defer sb.Close(context.Background(), sid)

	run := func(cmd string) (string, int) {
		t.Helper()
		var out strings.Builder
		code, err := sb.Exec(ctx, sid, cmd, func(b []byte) error { out.Write(b); return nil })
		if err != nil {
			t.Fatalf("Exec(%q): %v", cmd, err)
		}
		return out.String(), code
	}

	if out, code := run("echo hi; echo err >&2; exit 7"); code != 7 || out != "hi\nerr\n" {
		t.Errorf("exit/output = %d %q, want 7 \"hi\\nerr\\n\"", code, out)
	}
	if out, _ := run("id -u; pwd; echo $HOME"); out != "1000\n/workspace\n/workspace\n" {
		t.Errorf("identity = %q", out)
	}
	if out, _ := run("env"); strings.Contains(out, "WORKER_") || strings.Contains(out, "must-not-leak") {
		t.Errorf("worker env leaked into sandbox: %q", out)
	}
	if _, code := run("touch /app/x"); code == 0 {
		t.Error("root filesystem must be read-only")
	}
	if _, code := run("test -e /var/run/docker.sock"); code == 0 {
		t.Error("docker.sock must not be reachable")
	}
	if out, code := run("echo data > /workspace/f && cat /workspace/f"); code != 0 || out != "data\n" {
		t.Errorf("workspace write = %d %q", code, out)
	}
	if out, _ := run("cat /workspace/f"); out != "data\n" {
		t.Errorf("workspace must persist across one session's commands, got %q", out)
	}
	if out, code := run("hello-tool"); code != 0 || out != "tool-ok\n" {
		t.Errorf("tool on PATH = %d %q", code, out)
	}
	if _, code := run("touch " + sb.toolsTarget + "/x"); code == 0 {
		t.Error("tools mount must be read-only")
	}

	// Cancelling the command's context stops it by killing the container.
	cctx, ccancel := context.WithTimeout(ctx, 2*time.Second)
	start := time.Now()
	_, err = sb.Exec(cctx, sid, "sleep 60", func([]byte) error { return nil })
	ccancel()
	if err == nil || time.Since(start) > 30*time.Second {
		t.Errorf("cancelled exec: err=%v after %s, want a prompt error", err, time.Since(start))
	}

	// A fresh container serves the session after the kill; Close removes it.
	if out, _ := run("cat /workspace/f 2>/dev/null || echo gone"); out != "gone\n" {
		t.Errorf("killed session must restart clean, got %q", out)
	}
	id := sb.sessions[sid].containerID
	if err := sb.Close(ctx, sid); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if _, err := cli.ContainerInspect(ctx, id); err == nil {
		t.Errorf("container %s still exists after Close", shortID(id))
	}
}
