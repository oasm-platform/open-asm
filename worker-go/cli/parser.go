package cli

import (
	"fmt"
	"os"

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
	config.Values = make(map[string]string)

	var rootCmd = &cobra.Command{
		Use:   "oasm-worker",
		Short: "OASM Worker is an attack surface management agent",
		Long:  `OASM Worker is a high-performance agent used for attack surface management tasks.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			for _, p := range Params {
				val, _ := cmd.Flags().GetString(p.Name)
				config.Values[p.Name] = val

				if p.Required && val == "" {
					printBanner()
					return fmt.Errorf("missing required parameter --%s", p.Name)
				}
			}

			fmt.Println("Worker started successfully!")
			for k, v := range config.Values {
				fmt.Printf("%s: %s\n", k, v)
			}
			return nil
		},
	}

	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		printBanner()
		cmd.Help()
	})

	for _, p := range Params {
		rootCmd.PersistentFlags().String(p.Name, p.DefaultValue, p.Description)
	}

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
