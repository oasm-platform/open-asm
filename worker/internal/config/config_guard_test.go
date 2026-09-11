package config

import (
	"os"
	"strings"
	"testing"
)

// The default connector gRPC port is 26276 (migrated from 50051). WORKER_GRPC_PORT
// (16276, worker->core-api link) is a separate listener and must stay untouched.
func TestConnectorPortDefaultIs26276(t *testing.T) {
	data, err := os.ReadFile("config.go")
	if err != nil {
		t.Fatalf("read config.go: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, `viper.SetDefault("connector_port", 26276)`) {
		t.Fatal("connector_port default must be 26276")
	}
	if strings.Contains(src, `viper.SetDefault("connector_port", 50051)`) {
		t.Fatal("connector_port default must not be 50051")
	}
	if !strings.Contains(src, `viper.SetDefault("grpc_port", 16276)`) {
		t.Fatal("grpc_port default 16276 must stay intact (worker->core-api)")
	}
}
