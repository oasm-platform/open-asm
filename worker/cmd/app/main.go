package main

import (
	"log"
	"oasm-worker/internal/cli"
)

func main() {
	if err := cli.AppHeadless(); err != nil {
		log.Fatalf("Worker failed to start: %v", err)
	}
}
