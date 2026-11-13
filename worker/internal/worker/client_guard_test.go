package worker

import (
	"os"
	"strings"
	"testing"
)

// The connector gRPC server must listen on all interfaces ("host:port" with an
// empty host, i.e. ":26276") so connector containers can reach it via
// host.docker.internal / bridge IPs. Binding localhost would put the listener
// on the worker's loopback only — unreachable from spawned containers.
func TestConnectorServerBindsAllInterfaces(t *testing.T) {
	data, err := os.ReadFile("client.go")
	if err != nil {
		t.Fatalf("read client.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, `fmt.Sprintf(":%d", cfg.ConnectorPort)`) {
		t.Fatal("connector server must bind all interfaces: expected fmt.Sprintf with a bare \":\" port format")
	}
	for _, bad := range []string{
		`fmt.Sprintf("localhost:%d"`,
		`fmt.Sprintf("127.0.0.1:%d"`,
		`cfg.ConnectorHost`,
	} {
		if strings.Contains(src, bad) {
			t.Fatalf("connector server listen addr must not use %q (containers could not reach it)", bad)
		}
	}
}

// The egress proxy must bind all interfaces (same reachability rationale as
// the connector server) and must never bind localhost. Port publication to
// the host is a compose concern — client.go must not add one.
func TestEgressProxyBindsAllInterfaces(t *testing.T) {
	data, err := os.ReadFile("client.go")
	if err != nil {
		t.Fatalf("read client.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, `fmt.Sprintf(":%d", cfg.EgressPort)`) {
		t.Fatal("egress proxy must bind all interfaces")
	}
	for _, bad := range []string{
		`fmt.Sprintf("localhost:%d"`,
		`fmt.Sprintf("127.0.0.1:%d"`,
	} {
		if strings.Contains(src, bad) {
			t.Fatalf("egress proxy listen addr must not use %q (containers could not reach it)", bad)
		}
	}
}

// The egress proxy must receive the worker logger: without it every
// allow/deny/bytes log line is a no-op and spec observability dies.
func TestEgressProxyHasLogger(t *testing.T) {
	data, err := os.ReadFile("client.go")
	if err != nil {
		t.Fatalf("read client.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "Logger: log") {
		t.Fatal("egress.Options must carry Logger: log (worker TuiLogger)")
	}
}

func TestEgressHostOf(t *testing.T) {
	cases := []struct{ in, want string }{
		{"worker-1:26276", "worker-1"},
		{"host.docker.internal:41234", "host.docker.internal"},
		{"[fdc4::254]:26276", "fdc4::254"},
		{"bare-host", "bare-host"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := egressHostOf(tc.in); got != tc.want {
			t.Errorf("egressHostOf(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
