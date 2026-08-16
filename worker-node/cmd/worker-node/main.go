// Command worker-node is the OASM worker node binary: a gRPC client that
// joins core-api, keeps a heartbeat alive, and executes jobs until it is
// interrupted.
package main

import (
	"log"

	"worker-node/internal/cli"
)

func main() {
	if err := cli.Execute(); err != nil {
		log.Fatal(err)
	}
}
