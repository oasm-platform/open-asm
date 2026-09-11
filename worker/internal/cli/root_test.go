package cli

import (
	"strings"
	"testing"

	"oasm-worker/internal/config"
)

// The worker runs in one of two modes: "cli" (interactive TUI, default)
// or "node" (headless worker node). Mode is selected with --mode, or the
// WORKER_MODE environment variable surfaced via config.LoadConfig.

// resolveMode: an explicit WORKER_MODE (cfg.Mode) wins over the entrypoint
// default, so docker can pin node without a CLI flag.
func TestResolveModeEnvWins(t *testing.T) {
	cfg := &config.Config{Mode: "cli"}
	if got := resolveMode(cfg, "node"); got != "cli" {
		t.Fatalf("WORKER_MODE=cli must win over the node default, got %q", got)
	}
}

func TestResolveModeFallsBackToDefault(t *testing.T) {
	cfg := &config.Config{Mode: ""}
	if got := resolveMode(cfg, "node"); got != "node" {
		t.Fatalf("empty WORKER_MODE must fall back to the default, got %q", got)
	}
}

func TestRootCommandModeFlagDefaultIsCLI(t *testing.T) {
	cmd := rootCommand("cli")
	flag := cmd.Flags().Lookup("mode")
	if flag == nil {
		t.Fatal("expected --mode flag to be defined")
	}
	if flag.DefValue != "cli" {
		t.Fatalf("expected --mode default %q, got %q", "cli", flag.DefValue)
	}
}

func TestRootCommandAcceptsNodeMode(t *testing.T) {
	cmd := rootCommand("cli")
	if err := cmd.ParseFlags([]string{"--mode", "node"}); err != nil {
		t.Fatalf("parse --mode node: %v", err)
	}
	mode, err := cmd.Flags().GetString("mode")
	if err != nil {
		t.Fatalf("read --mode: %v", err)
	}
	if mode != "node" {
		t.Fatalf("expected mode %q, got %q", "node", mode)
	}
}

func TestRootCommandRejectsInvalidMode(t *testing.T) {
	cmd := rootCommand("cli")
	cmd.SetArgs([]string{"--mode", "banana"})
	err := cmd.Execute()
	if err == nil {
		t.Fatal("expected error for invalid --mode value")
	}
	if !strings.Contains(err.Error(), "banana") {
		t.Fatalf("expected error to mention the invalid mode, got: %v", err)
	}
}
