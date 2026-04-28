package main

import (
	"fmt"
	"log"
	"oasm-worker/internal/cli"
	"oasm-worker/internal/worker"
)

func main() {
	// Test network info
	info, err := worker.GetNetworkInfo()
	if err != nil {
		log.Printf("Error getting network info: %v", err)
	} else {
		fmt.Printf("Selected Interface: %s\n", info.Interface)
		fmt.Printf("IP: %s\n", info.IP)
		fmt.Printf("CIDR: %s\n", info.CIDR)
		fmt.Printf("Gateway IP: %s\n", info.GatewayIP)
		fmt.Printf("Gateway MAC: %s\n", info.GatewayMAC)
	}

	cli.Execute()
}
