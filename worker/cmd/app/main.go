package main

import (
	"context"
	"log"
	"oasm-worker/internal/cli"
)

func main() {
	// graceful shutdown ownership: root context cancelled on SIGINT/SIGTERM
	// (actual signal handling lives in internal/cli/root.go via signal.NotifyContext;
	// this ctx documents lifecycle ownership for transport reconnect loop).
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		<-ctx.Done()
		// ponytail: transport.Close() + runtime.CleanupAll() wired in Phase 3
	}()
	_ = ctx

	if err := cli.AppHeadless(); err != nil {
		log.Fatalf("Worker failed to start: %v", err)
	}
}
