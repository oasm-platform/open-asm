package main

import (
	"fmt"
	"log"
	"oasm-worker/internal/cli"
	"oasm-worker/internal/worker"
)

func main() {
	// Test network info
	infos, err := worker.GetNetworkInfos()
	if err != nil {
		log.Printf("Error getting network info: %v", err)
	} else {
		for i, info := range infos {
			fmt.Printf("Interface %d: %s\n", i+1, info.Interface)
			fmt.Printf("  IP: %s\n", info.IP)
			fmt.Printf("  CIDR: %s\n", info.CIDR)
			fmt.Printf("  Gateway IP: %s\n", info.GatewayIP)
			fmt.Printf("  Gateway MAC: %s\n", info.GatewayMAC)
			fmt.Println()
		}
	}

	cli.Execute()
}
