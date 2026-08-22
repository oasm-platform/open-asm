package runtime

import (
	"context"
	"fmt"
	"os"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// DockerRuntime implements ExecutionRuntime via Docker Engine API over docker.sock.
// ponytail: no CLI, no docker binary exec, only Engine API via github.com/docker/docker/client.
type DockerRuntime struct {
	cli  *client.Client
	host string // e.g. unix:///var/run/docker.sock (from WORKER_DOCKER_HOST)
}

// NewDockerRuntime creates a DockerRuntime dialing via docker.sock.
// host defaults to unix:///var/run/docker.sock; WORKER_DOCKER_HOST env overrides.
func NewDockerRuntime(host string) (*DockerRuntime, error) {
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
	return &DockerRuntime{cli: cli, host: host}, nil
}

// NewDockerRuntimeWithClient creates a DockerRuntime with an existing client (for tests).
func NewDockerRuntimeWithClient(cli *client.Client) *DockerRuntime {
	return &DockerRuntime{cli: cli, host: "test"}
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
	// ponytail: real impl would ImagePull if not present, then ContainerCreate with limits, read-only rootfs, no-new-privs, trace label
	// spec.Image is the manifest-resolved connector image (SDK+tool, ghcr.io/open-asm/connector-<tool>:<version>), not the upstream tool image — built from oasm-connectors/<category>/<tool>/Dockerfile (e.g. vulnerabilities/nuclei/Dockerfile)
	_ = container.Config{Image: spec.Image, Labels: map[string]string{"trace_id": opts.TraceID}}
	_ = container.HostConfig{}
	return Handle{ID: "docker-" + spec.Tool, Labels: map[string]string{"trace_id": opts.TraceID}}, nil
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
