package config

import (
	"testing"

	"github.com/spf13/viper"
)

// The agent sandbox is opt-in: existing workers keep host exec until the
// operator sets WORKER_AGENT_SANDBOX.
func TestLoadConfigAgentSandboxDefaults(t *testing.T) {
	viper.Reset()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.AgentSandbox || cfg.AgentSandboxImage != "" || cfg.AgentSandboxToolsSource != "" {
		t.Fatalf("defaults = %v/%q/%q, want false/auto/auto", cfg.AgentSandbox, cfg.AgentSandboxImage, cfg.AgentSandboxToolsSource)
	}
}

func TestLoadConfigAgentSandboxFromEnv(t *testing.T) {
	viper.Reset()
	t.Setenv("WORKER_AGENT_SANDBOX", "true")
	t.Setenv("WORKER_AGENT_SANDBOX_IMAGE", "oasm/oasm-worker:1.2.3")
	t.Setenv("WORKER_AGENT_SANDBOX_TOOLS_SOURCE", "tools-vol")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if !cfg.AgentSandbox || cfg.AgentSandboxImage != "oasm/oasm-worker:1.2.3" || cfg.AgentSandboxToolsSource != "tools-vol" {
		t.Fatalf("got %v/%q/%q", cfg.AgentSandbox, cfg.AgentSandboxImage, cfg.AgentSandboxToolsSource)
	}
}
