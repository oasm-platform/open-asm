package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// DockerRuntime implements ExecutionRuntime via Docker Engine API over docker.sock.
// ponytail: no CLI, no docker binary exec, only Engine API via github.com/docker/docker/client.
type DockerRuntime struct {
	cli            *client.Client
	host           string // e.g. unix:///var/run/docker.sock (from WORKER_DOCKER_HOST)
	connectorAddr  string // Worker's gRPC server address for connectors (e.g. host.docker.internal:50051)
	connectorToken string // shared secret for connector authentication
}

// NewDockerRuntime creates a DockerRuntime dialing via docker.sock.
// host defaults to unix:///var/run/docker.sock; WORKER_DOCKER_HOST env overrides.
func NewDockerRuntime(host, connectorAddr, connectorToken string) (*DockerRuntime, error) {
	if host == "" {
		host = "unix:///var/run/docker.sock"
	}
	if v := os.Getenv("WORKER_DOCKER_HOST"); v != "" {
		host = v
	}
	_ = os.Setenv("DOCKER_HOST", host)
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &DockerRuntime{
		cli:            cli,
		host:           host,
		connectorAddr:  connectorAddr,
		connectorToken: connectorToken,
	}, nil
}

// NewDockerRuntimeWithClient creates a DockerRuntime with an existing client (for tests).
func NewDockerRuntimeWithClient(cli *client.Client, connectorAddr, connectorToken string) *DockerRuntime {
	return &DockerRuntime{
		cli:            cli,
		host:           "test",
		connectorAddr:  connectorAddr,
		connectorToken: connectorToken,
	}
}

// generateExecID produces a random hex string for execution tracking.
func generateExecID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (d *DockerRuntime) Create(ctx context.Context, spec JobSpec, opts RuntimeOpts) (Handle, error) {
	if spec.Image == "" {
		return Handle{}, fmt.Errorf("image required")
	}
	if spec.Tool == "" {
		return Handle{}, fmt.Errorf("tool required")
	}
	if d.cli == nil {
		return Handle{}, fmt.Errorf("docker client not initialized")
	}

	// Build env vars: Worker connection params + execution metadata.
	execID := generateExecID()
	env := []string{
		"WORKER_GRPC_ADDR=" + d.connectorAddr,
		"WORKER_TOKEN=" + d.connectorToken,
		"EXECUTION_ID=" + execID,
		"JOB_ID=" + spec.Tool,
		"TOOL=" + spec.Tool,
		"TRACE_ID=" + opts.TraceID,
	}

	// Inject connector inputs as INPUT_<KEY>=<VALUE> env vars.
	for k, v := range spec.Inputs {
		env = append(env, "INPUT_"+strings.ToUpper(k)+"="+fmt.Sprintf("%v", v))
	}

	// Container config: image, env, labels for lifecycle management.
	config := &container.Config{
		Image: spec.Image,
		Env:   env,
		Labels: map[string]string{
			"trace_id":     opts.TraceID,
			"tool":         spec.Tool,
			"oasm-managed": "true",
		},
	}

	// Host config: resource limits + security hardening.
	// CPU: opts.CPU in millicores → NanoCPUs (1 millicore = 1e6 nanocpus).
	// Memory: opts.Memory in MB → bytes. MemorySwap = Memory disables swap.
	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			NanoCPUs:   int64(opts.CPU) * 1e6,
			Memory:     int64(opts.Memory) * 1024 * 1024,
			MemorySwap: int64(opts.Memory) * 1024 * 1024,
		},
		SecurityOpt:    []string{"no-new-privileges:true"},
		ReadonlyRootfs: false, // connectors may need to write temp files
	}

	resp, err := d.cli.ContainerCreate(ctx, config, hostConfig, nil, nil, "")
	if err != nil {
		return Handle{}, fmt.Errorf("container create: %w", err)
	}

	containerID := resp.ID

	// Start the container. Clean up on failure so we don't leak containers.
	if err := d.cli.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		_ = d.cli.ContainerRemove(context.Background(), containerID, container.RemoveOptions{Force: true})
		return Handle{}, fmt.Errorf("container start: %w", err)
	}

	return Handle{
		ID: containerID,
		Labels: map[string]string{
			"trace_id": opts.TraceID,
			"tool":     spec.Tool,
		},
	}, nil
}

func (d *DockerRuntime) Start(ctx context.Context, h Handle) error {
	if d.cli == nil {
		return fmt.Errorf("docker client not initialized")
	}
	return d.cli.ContainerStart(ctx, h.ID, container.StartOptions{})
}

func (d *DockerRuntime) Stop(ctx context.Context, h Handle) error {
	if d.cli == nil {
		return fmt.Errorf("docker client not initialized")
	}
	timeout := 10
	return d.cli.ContainerStop(ctx, h.ID, container.StopOptions{Timeout: &timeout})
}

func (d *DockerRuntime) Cancel(ctx context.Context, h Handle) error {
	return d.Stop(ctx, h)
}

func (d *DockerRuntime) Inspect(ctx context.Context, h Handle) (InspectResult, error) {
	if d.cli == nil {
		return InspectResult{}, fmt.Errorf("docker client not initialized")
	}
	j, err := d.cli.ContainerInspect(ctx, h.ID)
	if err != nil {
		return InspectResult{}, err
	}
	return InspectResult{Running: j.State.Running, ExitCode: j.State.ExitCode}, nil
}

func (d *DockerRuntime) Logs(ctx context.Context, h Handle) (<-chan []byte, error) {
	// ponytail: real impl streams via d.cli.ContainerLogs(ctx, h.ID, container.LogsOptions{ShowStdout:true, ShowStderr:true, Follow:true})
	_ = ctx
	_ = h
	ch := make(chan []byte)
	close(ch)
	return ch, nil
}

func (d *DockerRuntime) Cleanup(ctx context.Context, h Handle) error {
	if d.cli == nil {
		return nil
	}
	_ = d.cli.ContainerRemove(ctx, h.ID, container.RemoveOptions{Force: true})
	return nil
}
