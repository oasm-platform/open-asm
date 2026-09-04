package config

import (
	"errors"
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type TLSConfig struct {
	Enabled    bool   `mapstructure:"tls_enabled"`
	CAFile     string `mapstructure:"tls_ca_file"`
	CertFile   string `mapstructure:"tls_cert_file"`
	KeyFile    string `mapstructure:"tls_key_file"`
	ServerName string `mapstructure:"tls_server_name"`
}

type Config struct {
	ApiKey         string    `mapstructure:"api_key"`
	MaxConcurrency int       `mapstructure:"max_concurrency"`
	GrpcHost       string    `mapstructure:"grpc_host"`
	GrpcPort       int       `mapstructure:"grpc_port"`
	ToolPath       string    `mapstructure:"tool_path"`
	Network        string    `mapstructure:"network"`
	WorkspaceRoot  string    `mapstructure:"workspace_root"`
	TLS            TLSConfig `mapstructure:",squash"`

	// Connector server — Docker containers connect back to the worker via this gRPC endpoint.
	ConnectorPort                int    `mapstructure:"connector_port"`                  // gRPC port for connectors, default 26276
	ConnectorAddr                string `mapstructure:"connector_addr"`                  // REQUIRED dial address (host:port) connector containers use to reach the connector server; empty fails fast at runtime init unless autodetect is opted in below
	ConnectorAddrAllowAutodetect bool   `mapstructure:"connector_addr_allow_autodetect"` // WORKER_CONNECTOR_ADDR_ALLOW_AUTODETECT: restore the legacy auto-derive chain (self-IP → host.docker.internal → bridge gateway → 172.17.0.1) with a warning instead of failing fast
	ConnectorToken               string `mapstructure:"connector_token"`                 // shared secret for connector auth, empty = no auth
	Mode                         string `mapstructure:"mode"`                            // worker run mode: "cli", "node", or "" (unknown)
}

func LoadConfig() (*Config, error) {
	_ = godotenv.Load(".env")

	viper.SetEnvPrefix("WORKER")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()

	viper.SetDefault("api_key", "")
	viper.SetDefault("network", "")
	viper.SetDefault("max_concurrency", 10)
	viper.SetDefault("grpc_host", "localhost")
	viper.SetDefault("grpc_port", 16276)
	viper.SetDefault("tool_path", "oasm-tools")
	viper.SetDefault("workspace_root", "agent-sessions")
	viper.SetDefault("connector_port", 26276)
	viper.SetDefault("connector_addr", "") // REQUIRED dial address for connector containers; empty fails fast unless connector_addr_allow_autodetect is set
	viper.SetDefault("connector_addr_allow_autodetect", false)
	viper.SetDefault("connector_token", "")
	viper.SetDefault("mode", "")

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	// Connector protocol is one stream, one execution: a connector registers
	// under one execID and exits after the first Done, and the server closes
	// the stream after the first Done. Container pool reuse (multiple
	// executions sharing one container) would misroute/starve jobs 2..N and
	// carry a stale EXECUTION_ID env in the reused container. The knob is kept
	// only as a hard fail-fast so a leftover WORKER_POOL_ENABLED=true cannot
	// silently degrade; each execution gets its own container.
	if viper.GetBool("pool_enabled") {
		return nil, errors.New("pool reuse is not supported with the connector protocol (1 stream = 1 execution): WORKER_POOL_ENABLED=true rejected — every execution gets its own container; unset WORKER_POOL_ENABLED or set it to false")
	}

	return &cfg, nil
}
