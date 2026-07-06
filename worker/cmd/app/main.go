package main

import (
	"log"
	"oasm-worker/internal/cli"
)

func main() {
	if err := cli.App(); err != nil {
		log.Fatalf("Worker failed to start: %v", err)
	}
}
