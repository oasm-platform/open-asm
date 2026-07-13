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

	// Save real stdout/stderr for Bubbletea, redirect to /dev/null
	// so oasm-sdk-go internal logs don't interfere with TUI rendering
	realStdout := os.Stdout
	realStderr := os.Stderr
	if devNull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0); err == nil {
		os.Stdout = devNull
		os.Stderr = devNull
	}

	events := make(chan worker.TuiEvent, 100)
	go func() {
		worker.Start(ctx, cfg, events)
		close(events)
	}()

	// TUI renders to the real stdout, SDK logs go to /dev/null
	m := tui.NewModel(cfg, events)
	p := tea.NewProgram(m, tea.WithOutput(realStdout))

	// Wire ctx cancellation into the TUI so SIGTERM quits the program
	go func() {
		<-ctx.Done()
		p.Quit()
	}()

	if _, err := p.Run(); err != nil {
		os.Stdout = realStdout
		os.Stderr = realStderr
		return fmt.Errorf("TUI error: %v", err)
	}

	os.Stdout = realStdout
	os.Stderr = realStderr
	return nil
}

// AppHeadless runs the worker without a TUI (headless mode).
// Intended for Docker / production deployments where no TTY is available.
// Log output goes to stderr via TuiLogger's headless fallback.
func AppHeadless() error {
	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("fail to load config: %v", err)
	}

	if cfg.ApiKey == "" {
		return fmt.Errorf("missing required parameter --api-key (or env WORKER_API_KEY)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Headless mode: no TUI. Pass nil events channel.
	// TuiLogger falls back to writing formatted logs to stderr.
	// oasm-sdk-go internal logs also go to stderr — fine for Docker.
	worker.Start(ctx, cfg, nil)
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
