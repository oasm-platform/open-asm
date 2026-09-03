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
