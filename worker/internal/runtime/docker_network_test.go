package runtime

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
)

func selfInspector(t *testing.T, networks map[string]*network.EndpointSettings) *stubInspector {
	return &stubInspector{
		containerInspect: func(ctx context.Context, id string) (container.InspectResponse, error) {
			if id != "worker-1" {
				t.Fatalf("ContainerInspect(%q), want own hostname %q", id, "worker-1")
			}
			return container.InspectResponse{
				NetworkSettings: &container.NetworkSettings{Networks: networks},
			}, nil
		},
	}
}

// Each scaled replica resolves its own IP on the connector network, so all of
// them keep the default port without a published host port.
func TestResolveSelfNetworkAddrUsesOwnIPOnNetwork(t *testing.T) {
	di := selfInspector(t, map[string]*network.EndpointSettings{
		"oasm":            {IPAddress: "172.20.0.5"},
		"oasm-connectors": {IPAddress: "172.21.0.7"},
	})
	got, err := resolveSelfNetworkAddr(context.Background(), di, "worker-1", "oasm-connectors", 26276)
	if err != nil {
		t.Fatalf("resolveSelfNetworkAddr: %v", err)
	}
	if got != "172.21.0.7:26276" {
		t.Fatalf("addr = %q, want the connector-network IP %q", got, "172.21.0.7:26276")
	}
}

func TestResolveSelfNetworkAddrFailsWhenNotAttached(t *testing.T) {
	di := selfInspector(t, map[string]*network.EndpointSettings{
		"oasm": {IPAddress: "172.20.0.5"},
	})
	_, err := resolveSelfNetworkAddr(context.Background(), di, "worker-1", "oasm-connectors", 26276)
	if err == nil || !strings.Contains(err.Error(), "oasm-connectors") {
		t.Fatalf("err = %v, want a failure naming the missing network", err)
	}
}

// A worker that is not a container (host process) cannot use the network
// mode; the error must say so instead of guessing an address.
func TestResolveSelfNetworkAddrFailsOutsideContainer(t *testing.T) {
	di := &stubInspector{
		containerInspect: func(ctx context.Context, id string) (container.InspectResponse, error) {
			return container.InspectResponse{}, errors.New("No such container: my-laptop")
		},
	}
	_, err := resolveSelfNetworkAddr(context.Background(), di, "my-laptop", "oasm-connectors", 26276)
	if err == nil || !strings.Contains(err.Error(), "must run as a container") {
		t.Fatalf("err = %v, want guidance that the worker must be a container", err)
	}
}
