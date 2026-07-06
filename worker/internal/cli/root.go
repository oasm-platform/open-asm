// Package cli
package cli

import (
	"context"
	"fmt"
	"oasm-worker/internal/config"
	"oasm-worker/internal/worker"
	"os"
	"os/signal"
	"syscall"

	"github.com/common-nighthawk/go-figure"
	"github.com/fatih/color"
	"github.com/oasm-platform/oasm-sdk-go/oasm"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func printBanner() {
	green := color.New(color.FgHiCyan).SprintFunc()
	myFigure := figure.NewFigure("OASM Agent", "slant", true)
	fmt.Print(green(myFigure.String()))
}

func App() error {
	printBanner()

	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("fail to load config: %v", err)
	}

	if cfg.ApiKey == "" {
		return fmt.Errorf("missing required parameter --api-key (or env WORKER_API_KEY)")
	}

	oasm.NewLogger("CLI").Verbose("Config loaded | MaxConcurrency: %d | Host: %s:%d | Network: %s",
		cfg.MaxConcurrency, cfg.GrpcHost, cfg.GrpcPort, cfg.Network)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	worker.Start(ctx, cfg)
	return nil
}

func Execute() {
	rootCmd := &cobra.Command{
		Use:   "oasm-worker",
		Short: "OASM Worker is an attack surface management agent",
		Long:  `OASM Worker is a high-performance agent used for attack surface management tasks.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return App()
		},
	}

	rootCmd.Flags().String("api-key", "", "API key for authentication")
	viper.BindPFlag("api_key", rootCmd.Flags().Lookup("api-key"))

	rootCmd.Flags().Int("max-concurrency", 10, "Maximum number of concurrent tasks")
	viper.BindPFlag("max_concurrency", rootCmd.Flags().Lookup("max-concurrency"))

	rootCmd.Flags().String("grpc-host", "localhost", "gRPC server host")
	viper.BindPFlag("grpc_host", rootCmd.Flags().Lookup("grpc-host"))

	rootCmd.Flags().Int("grpc-port", 16276, "gRPC server port")
	viper.BindPFlag("grpc_port", rootCmd.Flags().Lookup("grpc-port"))

	rootCmd.Flags().String("tool-path", "oasm-tools", "Tool path")
	viper.BindPFlag("tool_path", rootCmd.Flags().Lookup("tool-path"))

	rootCmd.Flags().String("network", "", "Network ID for internal network connection")
	viper.BindPFlag("network", rootCmd.Flags().Lookup("network"))

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
