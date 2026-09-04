package config

import (
	"testing"

	"github.com/spf13/viper"
)

// The connector protocol is one stream per execution: a connector registers
// under one execID and exits after the first Done, and the server closes the
// stream after the first Done. Pool_enabled must therefore default to false —
// pooled reuse would misroute/starve jobs 2..N and carry a stale EXECUTION_ID
// env in the reused container.
func TestPoolEnabledDefaultIsFalse(t *testing.T) {
	viper.Reset() // fresh viper — no overrides from previous LoadConfig calls
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.PoolEnabled {
		t.Fatal("PoolEnabled must default to false: the connector protocol is one stream per execution")
	}
	// pooling() is Enabled && MaxJobsPerContainer > 1 && IdleTimeout > 0.
	if cfg.PoolEnabled && cfg.MaxJobsPerContainer > 1 && cfg.PoolIdleTimeout > 0 {
		t.Fatal("pooling must be disabled with default config")
	}
}
