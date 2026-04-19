package cli

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/common-nighthawk/go-figure"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

func loadEnv(filename string) map[string]string {
	env := make(map[string]string)
	file, err := os.Open(filename)
	if err != nil {
		return env
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			env[parts[0]] = parts[1]
		}
	}
	return env
}

func printBanner() {
	green := color.New(color.FgGreen).SprintFunc()
	myFigure := figure.NewFigure("OASM Agent", "standard", true)
	fmt.Print(green(myFigure.String()))
}

func Execute() {
	var config Config

	rootCmd := &cobra.Command{
		Use:   "oasm-worker",
		Short: "OASM Worker is an attack surface management agent",
		Long:  `OASM Worker is a high-performance agent used for attack surface management tasks.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			paramMap := Params.All()
			envMap := loadEnv(".env")

			for name, p := range paramMap {
				val := p.DefaultValue

				if envVal, ok := envMap[p.KeyEnv]; ok && envVal != "" {
					val = envVal
				}

				if cmd.Flags().Changed(name) {
					flagVal, _ := cmd.Flags().GetString(name)
					if flagVal != "" {
						val = flagVal
					}
				}

				if p.Required && val == "" {
					printBanner()
					return fmt.Errorf("missing required parameter --%s (or env %s)", name, p.KeyEnv)
				}

				switch name {
				case Params.ApiKey.Key:
					config.ApiKey = val
				case Params.MaxConcurrency.Key:
					i, _ := strconv.Atoi(val)
					config.MaxConcurrency = i
				case Params.GrpcHost.Key:
					config.GrpcHost = val
				case Params.GrpcPort.Key:
					i, _ := strconv.Atoi(val)
					config.GrpcPort = i
				case Params.ToolPath.Key:
					config.ToolPath = val
				}
			}

			fmt.Println("Worker started successfully!")
			fmt.Printf("ApiKey: %s\nMaxConcurrency: %d\nGrpcHost: %s\nGrpcPort: %d\n",
				config.ApiKey, config.MaxConcurrency, config.GrpcHost, config.GrpcPort)

			ctx := context.Background()
			Connect(ctx, config)
			return nil
		},
	}

	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		printBanner()
		cmd.Usage()
	})

	paramMap := Params.All()

	for name, p := range paramMap {
		rootCmd.PersistentFlags().String(name, p.DefaultValue, p.Description)
	}

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
