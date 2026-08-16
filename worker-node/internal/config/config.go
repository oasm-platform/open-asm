package config

import (
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	APIKey         string `mapstructure:"api_key"`
	Signature      string `mapstructure:"signature"`
	MaxConcurrency int    `mapstructure:"max_concurrency"`
	GRPCHost       string `mapstructure:"grpc_host"`
	GRPCPort       int    `mapstructure:"grpc_port"`
}

func Load() (*Config, error) {
	_ = godotenv.Load(".env")

	viper.SetEnvPrefix("WORKER")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()

	viper.SetDefault("api_key", "")
	viper.SetDefault("signature", "")
	viper.SetDefault("max_concurrency", 10)
	viper.SetDefault("grpc_host", "localhost")
	viper.SetDefault("grpc_port", 16276)

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
