package cli

import (
	"strings"
	"testing"
)

// The worker runs in one of two modes: "cli" (interactive TUI, default)
// or "node" (headless worker node). Mode is selected with --mode.

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
