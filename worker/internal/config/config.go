package config

import (
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	ApiKey         string `mapstructure:"api_key"`
	MaxConcurrency int    `mapstructure:"max_concurrency"`
	GrpcHost       string `mapstructure:"grpc_host"`
	GrpcPort       int    `mapstructure:"grpc_port"`
	ToolPath       string `mapstructure:"tool_path"`
}

func LoadConfig() (*Config, error) {
	viper.SetConfigFile(".env")
	_ = viper.ReadInConfig()

	viper.SetEnvPrefix("WORKER")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()

	viper.SetDefault("max_concurrency", 10)
	viper.SetDefault("grpc_host", "localhost")
	viper.SetDefault("grpc_port", 16276)
	viper.SetDefault("tool_path", "oasm-tools")

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
