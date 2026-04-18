package cli

import (
	"fmt"
	"os"
	"strconv"

	"github.com/common-nighthawk/go-figure"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

func printBanner() {
	green := color.New(color.FgGreen).SprintFunc()
	myFigure := figure.NewFigure("OASM Agent", "standard", true)
	fmt.Print(green(myFigure.String()))
}

func Execute() {
	var config Config

	var rootCmd = &cobra.Command{
		Use:   "oasm-worker",
		Short: "OASM Worker is an attack surface management agent",
		Long:  `OASM Worker is a high-performance agent used for attack surface management tasks.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			paramMap := Params.All()

			for name, p := range paramMap {
				val, _ := cmd.Flags().GetString(name)

				if p.Required && val == "" {
					printBanner()
					return fmt.Errorf("missing required parameter --%s", name)
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
				}
			}

			fmt.Println("Worker started successfully!")
			fmt.Printf("ApiKey: %s\nMaxConcurrency: %d\nGrpcHost: %s\nGrpcPort: %d\n",
				config.ApiKey, config.MaxConcurrency, config.GrpcHost, config.GrpcPort)

			Connect(config)
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
