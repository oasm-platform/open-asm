package config

import (
	"testing"

	"github.com/spf13/viper"
)

func TestLoadDefaults(t *testing.T) {
	viper.Reset()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.APIKey != "" {
		t.Errorf("APIKey = %q, want empty", cfg.APIKey)
	}
	if cfg.Signature != "" {
		t.Errorf("Signature = %q, want empty", cfg.Signature)
	}
	if cfg.MaxConcurrency != 10 {
		t.Errorf("MaxConcurrency = %d, want 10", cfg.MaxConcurrency)
	}
	if cfg.GRPCHost != "localhost" {
		t.Errorf("GRPCHost = %q, want localhost", cfg.GRPCHost)
	}
	if cfg.GRPCPort != 16276 {
		t.Errorf("GRPCPort = %d, want 16276", cfg.GRPCPort)
	}
}

func TestLoadEnvOverrides(t *testing.T) {
	viper.Reset()

	t.Setenv("WORKER_API_KEY", "k")
	t.Setenv("WORKER_GRPC_PORT", "9999")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.APIKey != "k" {
		t.Errorf("APIKey = %q, want k", cfg.APIKey)
	}
	if cfg.GRPCPort != 9999 {
		t.Errorf("GRPCPort = %d, want 9999", cfg.GRPCPort)
	}
}

func TestLoadSignatureDefault(t *testing.T) {
	viper.Reset()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Signature != "" {
		t.Errorf("Signature = %q, want empty", cfg.Signature)
	}
}
