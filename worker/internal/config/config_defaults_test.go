package config

import (
	"testing"

	"github.com/spf13/viper"
)

// Phase 2: warm-pool container reuse is now supported and ON by default.
// pool_enabled defaults to true so a single node worker reuses idle containers
// across jobs of the same image; WORKER_POOL_ENABLED=false is the kill-switch
// that restores the legacy 1-stream-1-container behavior.
func TestLoadConfigPoolEnabledDefaultTrue(t *testing.T) {
	viper.Reset()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if !cfg.PoolEnabled {
		t.Fatal("pool_enabled must default to true (warm-pool reuse)")
	}
}

func TestLoadConfigPoolKillSwitchDisables(t *testing.T) {
	viper.Reset()
	t.Setenv("WORKER_POOL_ENABLED", "false")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.PoolEnabled {
		t.Fatal("WORKER_POOL_ENABLED=false must disable the pool (legacy 1:1)")
	}
}

func TestLoadConfigConnectorIdleTimeoutDefault60(t *testing.T) {
	viper.Reset()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.ConnectorIdleTimeout != 60 {
		t.Fatalf("connector_idle_timeout must default to 60s, got %d", cfg.ConnectorIdleTimeout)
	}
}

func TestLoadConfigMaxReplicasPerImageDefault1(t *testing.T) {
	viper.Reset()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.MaxReplicasPerImage != 1 {
		t.Fatalf("max_replicas_per_image must default to 1 (queue-behind-one replica), got %d", cfg.MaxReplicasPerImage)
	}
}
