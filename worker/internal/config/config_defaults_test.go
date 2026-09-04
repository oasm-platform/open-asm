package config

import (
	"os"
	"strings"
	"testing"

	"github.com/spf13/viper"
)

// The connector protocol is one stream per execution: a connector registers
// under one execID and exits after the first Done, and the server closes the
// stream after the first Done. Container pool reuse (multiple executions
// sharing one container) is therefore unsupported: WORKER_POOL_ENABLED=true
// must fail fast with a clear reason instead of silently degrading.
func TestLoadConfigRejectsPoolEnabled(t *testing.T) {
	viper.Reset() // fresh viper — no overrides from previous LoadConfig calls
	t.Setenv("WORKER_POOL_ENABLED", "true")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when WORKER_POOL_ENABLED=true (pool reuse is unsupported with single-exec connectors)")
	}
	if !strings.Contains(err.Error(), "pool reuse") {
		t.Fatalf("error must explain the pool-reuse ban, got %q", err.Error())
	}
}

// Source guard: the Config struct must not resurrect the pool knobs. 1 stream =
// 1 execution; pooled reuse would misroute/starve jobs 2..N.
func TestNoContainerPoolKnobs(t *testing.T) {
	src, err := os.ReadFile("config.go")
	if err != nil {
		t.Fatalf("read config.go: %v", err)
	}
	if strings.Contains(string(src), `mapstructure:"pool_enabled"`) {
		t.Fatal("config.go must not expose the pool_enabled field again (1 stream = 1 execution; pool reuse unsupported)")
	}
}
