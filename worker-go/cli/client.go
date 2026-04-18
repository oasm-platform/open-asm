package cli

import (
	"fmt"

	"github.com/oasm-platform/oasm-sdk-go/oasm"
)

func Connect(cfg Config) {
	client, err := oasm.NewClient(oasm.WithApiKey(cfg.ApiKey))
	if err != nil {
		fmt.Errorf(err.Error())
	}
}
