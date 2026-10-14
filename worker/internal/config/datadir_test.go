package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
)

// Path defaults live under the per-user ~/.oasm, never the working directory
// (an elevated PowerShell starts in C:\Windows\System32).
func TestLoadConfigPathDefaultsUnderUserHome(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("no user home: %v", err)
	}
	viper.Reset()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if want := filepath.Join(home, ".oasm", "oasm-tools"); cfg.ToolPath != want {
		t.Fatalf("tool_path default = %q, want %q", cfg.ToolPath, want)
	}
	if want := filepath.Join(home, ".oasm", "agent-sessions"); cfg.WorkspaceRoot != want {
		t.Fatalf("workspace_root default = %q, want %q", cfg.WorkspaceRoot, want)
	}
}
