package worker

import (
	"context"
	"time"

	"oasm-worker/internal/config"
	"oasm-worker/internal/grpcclient"
	"oasm-worker/internal/runtime"
)

// initAgentSandbox builds the agent command sandbox on the Docker runtime and
// removes sandbox containers a previous run of this worker leaked. Bounded so
// a hung engine cannot stall startup. Runs before Connect, like the connector
// orphan reconcile, so OwnerID is still the boot identity and no session of
// this process exists yet.
func initAgentSandbox(ctx context.Context, rt *runtime.DockerRuntime, cfg *config.Config, toolPath string, grpcClient *grpcclient.Client, log *TuiLogger) (*runtime.AgentSandbox, error) {
	ictx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	sb, err := runtime.NewAgentSandbox(ictx, rt, runtime.AgentSandboxOptions{
		Image:       cfg.AgentSandboxImage,
		ToolPath:    toolPath,
		ToolsSource: cfg.AgentSandboxToolsSource,
		OwnerID:     grpcClient.OwnerID,
	})
	if err != nil {
		return nil, err
	}
	sb.ReconcileOrphans(ictx, grpcClient.OwnerID())

	if m := sb.ToolsMount(); m != nil {
		log.Success("agent sandbox enabled (image %s, tools %s %s -> %s read-only)", sb.Image(), m.Type, m.Source, m.Target)
	} else {
		log.Warning("agent sandbox enabled (image %s) WITHOUT a tools mount: the worker's tool path is not a volume or bind; set WORKER_AGENT_SANDBOX_TOOLS_SOURCE", sb.Image())
	}
	return sb, nil
}
