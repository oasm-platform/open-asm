// Package cli implements the worker-node command-line entry point.
package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"worker-node/internal/config"
	"worker-node/internal/worker"
)

// Execute builds the root command, binds its flags to viper (so flags win
// over WORKER_* env vars and viper defaults), and runs it. It returns the
// first error encountered; main is responsible for reporting it.
func Execute() error {
	rootCmd := &cobra.Command{
		Use:   "worker-node",
		Short: "OASM worker node (gRPC client)",
		RunE: func(cmd *cobra.Command, args []string) error {
			// config.Load() must run after cobra has parsed the flags so the
			// viper flag bindings made below are visible to it.
			cfg, err := config.Load()
			if err != nil {
				return err
			}

			if cfg.APIKey == "" {
				return fmt.Errorf("missing required parameter --api-key (or env WORKER_API_KEY)")
			}
			if cfg.MaxConcurrency < 1 {
				return fmt.Errorf("--max-concurrency must be >= 1")
			}

			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			return worker.Run(ctx, cfg)
		},
	}

	rootCmd.Flags().String("api-key", "", "API key for authentication")
	_ = viper.BindPFlag("api_key", rootCmd.Flags().Lookup("api-key"))

	rootCmd.Flags().String("grpc-host", "localhost", "gRPC server host")
	_ = viper.BindPFlag("grpc_host", rootCmd.Flags().Lookup("grpc-host"))

	rootCmd.Flags().Int("grpc-port", 16276, "gRPC server port")
	_ = viper.BindPFlag("grpc_port", rootCmd.Flags().Lookup("grpc-port"))

	rootCmd.Flags().Int("max-concurrency", 10, "Maximum number of concurrent jobs")
	_ = viper.BindPFlag("max_concurrency", rootCmd.Flags().Lookup("max-concurrency"))

	rootCmd.Flags().String("signature", "", "Worker signature")
	_ = viper.BindPFlag("signature", rootCmd.Flags().Lookup("signature"))

	return rootCmd.Execute()
}
