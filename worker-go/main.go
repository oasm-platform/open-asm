package main

import (
	"fmt"
	"oasm-worker/cli"
)

func main() {
	config := cli.Parse()

	fmt.Println("Worker started successfully!")
	fmt.Printf("API Key: %s\n", config.Values["apikey"])
}
