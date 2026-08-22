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
	ConnectorPort  int    `mapstructure:"connector_port"`  // gRPC port for connectors, default 50051
	ConnectorAddr  string `mapstructure:"connector_addr"`  // listen address, default "0.0.0.0:50051"
	ConnectorToken string `mapstructure:"connector_token"` // shared secret for connector auth, empty = no auth
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
	viper.SetDefault("connector_port", 50051)
	viper.SetDefault("connector_addr", "0.0.0.0:50051")
	viper.SetDefault("connector_token", "")

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
