// Package cli
package cli

import (
	"context"
	"fmt"
	"oasm-worker/internal/config"
	"oasm-worker/internal/tui"
	"oasm-worker/internal/worker"
	"os"
	"os/signal"
	"syscall"

	tea "charm.land/bubbletea/v2"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func App() error {
	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("fail to load config: %v", err)
	}

	if cfg.ApiKey == "" {
		return fmt.Errorf("missing required parameter --api-key (or env WORKER_API_KEY)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Save real stdout for Bubbletea, redirect os.Stdout to /dev/null
	// so oasm-sdk-go internal logs don't interfere with TUI rendering
	realStdout := os.Stdout
	if devNull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0); err == nil {
		os.Stdout = devNull
		os.Stderr = devNull
	}

	events := make(chan worker.TuiEvent, 100)
	go worker.Start(ctx, cfg, events)

	// TUI renders to the real stdout, SDK logs go to /dev/null
	m := tui.NewModel(cfg, events)
	p := tea.NewProgram(m, tea.WithOutput(realStdout))
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI error: %v", err)
	}

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
