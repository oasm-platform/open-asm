package runtime

import (
	"strings"
	"testing"
)

func envMap(env []string) map[string]string {
	m := map[string]string{}
	for _, e := range env {
		if k, v, ok := strings.Cut(e, "="); ok {
			m[k] = v
		}
	}
	return m
}

// Enabled egress injects proxy vars (upper + lower), socks5h ALL_PROXY with
// the per-execution token, loopback + worker-host NO_PROXY, and the on marker.
func TestBuildContainerEnvEgressEnabled(t *testing.T) {
	spec := JobSpec{JobID: "j-eg", Tool: "nuclei", TraceID: "t-eg", ConnectorToken: "exec-tok-1"}
	env := buildContainerEnv(spec, "worker-1:26276", "legacy", "exec-1", EgressConfig{Addr: "worker-1:26277", GrpcHost: "core-api", Enabled: true})
	m := envMap(env)
	wantProxy := "http://exec-tok-1@worker-1:26277"
	for _, k := range []string{"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"} {
		if m[k] != wantProxy {
			t.Errorf("%s = %q, want %q", k, m[k], wantProxy)
		}
	}
	for _, k := range []string{"ALL_PROXY", "all_proxy"} {
		if m[k] != "socks5h://exec-tok-1@worker-1:26277" {
			t.Errorf("%s = %q", k, m[k])
		}
	}
	if m["WORKER_EGRESS_PROXY"] != "on" {
		t.Errorf("WORKER_EGRESS_PROXY = %q, want on", m["WORKER_EGRESS_PROXY"])
	}
	for _, want := range []string{"localhost", "127.0.0.1", "::1", "worker-1", "core-api"} {
		if !strings.Contains(m["NO_PROXY"]+","+m["no_proxy"], want) {
			t.Errorf("NO_PROXY must contain %q, got %q", want, m["NO_PROXY"])
		}
	}
	if strings.Contains(m["NO_PROXY"], "169.254.169.254") {
		t.Error("NO_PROXY must not bypass the metadata IP (deny, not bypass)")
	}
}

// Disabled egress emits no proxy vars but keeps the off marker.
func TestBuildContainerEnvEgressDisabled(t *testing.T) {
	spec := JobSpec{JobID: "j-eg2", Tool: "nuclei", ConnectorToken: "tok"}
	env := buildContainerEnv(spec, "worker-1:26276", "legacy", "exec-1", EgressConfig{})
	m := envMap(env)
	for _, k := range []string{"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"} {
		if _, ok := m[k]; ok {
			t.Errorf("%s must be absent when egress disabled, got %q", k, m[k])
		}
	}
	if m["WORKER_EGRESS_PROXY"] != "off" {
		t.Errorf("WORKER_EGRESS_PROXY = %q, want off", m["WORKER_EGRESS_PROXY"])
	}
}

// withEgressPort swaps the connector port for the egress port on the same host.
func TestWithEgressPort(t *testing.T) {
	cases := []struct {
		in   string
		port int
		want string
	}{
		{"worker-1:26276", 26277, "worker-1:26277"},
		{"host.docker.internal:41234", 41235, "host.docker.internal:41235"},
		{"worker-1", 26277, "worker-1:26277"},
		{"", 26277, ""},
	}
	for _, tc := range cases {
		if got := WithEgressPort(tc.in, tc.port); got != tc.want {
			t.Errorf("WithEgressPort(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// Raw port scanners bypass the egress proxy; everything else is proxied.
func TestDirectEgress(t *testing.T) {
	cases := map[string]bool{
		"ghcr.io/oasm-platform/connector-nmap:7.97":       true,
		"ghcr.io/oasm-platform/connector-rustscan:2.4.1":  true,
		"GHCR.IO/OASM-PLATFORM/CONNECTOR-NMAP":            true,
		"ghcr.io/oasm-platform/connector-nmap@sha256:abc": true,
		"localhost:5000/connector-rustscan:dev":           true,
		"ghcr.io/oasm-platform/connector-nuclei:3.11.1":   false,
		"ghcr.io/oasm-platform/connector-nmap-extra:1":    false,
		"": false,
	}
	for image, want := range cases {
		if got := directEgress(image); got != want {
			t.Errorf("directEgress(%q) = %v, want %v", image, got, want)
		}
	}
}
