package config

import (
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

	// Warm-pool container reuse (Phase 2).
	// PoolEnabled defaults to true; WORKER_POOL_ENABLED=false is the kill-switch
	// restoring the legacy 1-stream-1-container behavior (no acquire/reuse).
	PoolEnabled bool `mapstructure:"pool_enabled"`
	// ConnectorIdleTimeout is how long an idle pooled container may stay alive
	// before the sweeper stops+removes it. Seconds; default 60.
	// WORKER_CONNECTOR_IDLE_TIMEOUT exists for tuning/tests only — the code
	// constant ConnectorIdleTimeout in execution/timeouts.go is the default.
	ConnectorIdleTimeout int `mapstructure:"connector_idle_timeout"`
	// MaxReplicasPerImage caps how many busy containers may exist per image
	// (env WORKER_MAX_REPLICAS_PER_IMAGE always wins). Phase 3 replica policy:
	// when no idle container is available and the cap is reached, the job backs
	// off (job.go exhausted→retry) until an idle replica frees up — never a
	// hard Core failure. Default 1 = queue-behind-one: a burst on an empty pool
	// creates ONE container and reuses it serially; raise for per-image
	// parallelism at the cost of RAM and docker-daemon load.
	MaxReplicasPerImage int `mapstructure:"max_replicas_per_image"`
	// MaxJobsPerContainer caps sequential jobs a single pooled container may
	// run. Fixed at 1 in Phase 2 (a container is Busy while an execution is
	// in flight; reuse happens only when Idle).
	MaxJobsPerContainer int `mapstructure:"max_jobs_per_container"`
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
	viper.SetDefault("pool_enabled", true)
	viper.SetDefault("connector_idle_timeout", 60)
	viper.SetDefault("max_replicas_per_image", 1)
	viper.SetDefault("max_jobs_per_container", 1)

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
