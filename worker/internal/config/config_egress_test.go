package config

import (
	"testing"

	"github.com/spf13/viper"
)

// The egress proxy listener defaults to port 26277 (one above the connector
// gRPC port 26276) and is enabled by default. WORKER_EGRESS_PROXY=off is the
// kill switch restoring direct container egress.
func TestLoadConfigEgressDefaults(t *testing.T) {
	viper.Reset()
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.EgressPort != 26277 {
		t.Fatalf("egress_port must default to 26277, got %d", cfg.EgressPort)
	}
	if cfg.EgressProxy != "on" {
		t.Fatalf("egress_proxy must default to %q, got %q", "on", cfg.EgressProxy)
	}
	if !EgressEnabled(*cfg) {
		t.Fatal("egress must be enabled by default")
	}
}

func TestLoadConfigEgressPortZeroMeansOSAssigned(t *testing.T) {
	viper.Reset()
	t.Setenv("WORKER_EGRESS_PORT", "0")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.EgressPort != 0 {
		t.Fatalf("egress_port must honor WORKER_EGRESS_PORT=0, got %d", cfg.EgressPort)
	}
}

func TestLoadConfigEgressKillSwitch(t *testing.T) {
	for _, v := range []string{"off", "OFF", "Off"} {
		viper.Reset()
		t.Setenv("WORKER_EGRESS_PROXY", v)
		cfg, err := LoadConfig()
		if err != nil {
			t.Fatalf("LoadConfig: %v", err)
		}
		if EgressEnabled(*cfg) {
			t.Fatalf("WORKER_EGRESS_PROXY=%q must disable egress", v)
		}
	}
}

// Only the literal "off" (any case) disables: a "0" is a config typo, not an
// opt-out, and must keep the proxy enabled (fail closed).
func TestLoadConfigEgressZeroDoesNotDisable(t *testing.T) {
	viper.Reset()
	t.Setenv("WORKER_EGRESS_PROXY", "0")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if !EgressEnabled(*cfg) {
		t.Fatal("WORKER_EGRESS_PROXY=0 must keep egress enabled (only literal off disables)")
	}
}
