package cli

import (
	"flag"
	"fmt"
	"os"

	"github.com/common-nighthawk/go-figure"
	"github.com/fatih/color"
)

func printBanner() {
	green := color.New(color.FgGreen).SprintFunc()
	myFigure := figure.NewFigure("OASM Agent", "standard", true)
	fmt.Print(green(myFigure.String()))
}

func Parse() *Config {
	fs := flag.NewFlagSet("oasm-worker", flag.ExitOnError)

	values := make(map[string]string)
	tempValues := make(map[string]*string)

	for _, p := range Params {
		val := fs.String(p.Name, p.DefaultValue, p.Description)
		tempValues[p.Name] = val
	}

	fs.Usage = func() {
		printBanner()
		fmt.Println("Usage of oasm-worker:")
		fs.PrintDefaults()
		os.Exit(0)
	}

	if len(os.Args) < 2 || os.Args[1] == "-h" || os.Args[1] == "--help" {
		fs.Usage()
	}

	if err := fs.Parse(os.Args[1:]); err != nil {
		fmt.Printf("Error parsing flags: %v\n", err)
		os.Exit(1)
	}

	for name, ptr := range tempValues {
		values[name] = *ptr
	}

	for _, p := range Params {
		if p.Required && values[p.Name] == "" {
			printBanner()
			fmt.Printf("Error: missing required parameter --%s\n", p.Name)
			fs.Usage()
		}
	}

	return &Config{Values: values}
}
