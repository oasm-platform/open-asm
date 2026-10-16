package runtime

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/docker/docker/errdefs"
	"github.com/docker/docker/pkg/stdcopy"
)

// Agent shell commands (remote execute COMMAND) run in one container per
// agent session instead of `sh -c` on the worker host. On a shared global
// worker the host holds the platform cloud key, the join token and
// docker.sock; the sandbox gets none of them — only a read-only tools mount.
const (
	AgentSandboxLabel        = "oasm.agent_sandbox"
	agentSandboxSessionLabel = "oasm.session_id"
	agentSandboxOwnerLabel   = "oasm.worker_id"

	agentSandboxDefaultImage = "oasm/oasm-worker:latest"
	agentSandboxWorkdir      = "/workspace"
	agentSandboxUser         = "1000:1000"
	// agentSandboxToolsFallback is where tools are mounted when the worker's
	// own tool path is not a POSIX path (a Windows host worker).
	agentSandboxToolsFallback = "/opt/oasm-tools"
	agentSandboxBasePath      = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

	agentSandboxPidsLimit = 512
	agentSandboxMemory    = 1 << 30 // 1 GiB, swap disabled (MemorySwap == Memory)
	agentSandboxNanoCPUs  = 1e9     // 1 CPU
)

// ErrSandboxSessionClosed is returned when a command races its session's
// teardown; the caller reports it as a command error.
var ErrSandboxSessionClosed = errors.New("agent sandbox session closed")

// AgentSandboxOptions configures NewAgentSandbox.
type AgentSandboxOptions struct {
	// Image overrides the sandbox image. Empty = the worker's own container
	// image when containerized, else oasm/oasm-worker:latest.
	Image string
	// ToolPath is the worker's absolute tool directory.
	ToolPath string
	// ToolsSource overrides what is mounted at the tool path: a volume name or
	// an absolute host path. Empty = auto-detect.
	ToolsSource string
	// OwnerID returns the worker ownership fingerprint stamped as
	// oasm.worker_id (grpcclient.OwnerID). Evaluated per create: the first-ever
	// run only has an identity after Join.
	OwnerID func() string
}

// AgentSandboxSpec is the input of BuildAgentSandboxConfig.
type AgentSandboxSpec struct {
	Image       string
	SessionID   string
	OwnerID     string
	ToolsMount  *mount.Mount // nil = no tools mount
	ToolsTarget string       // tool dir inside the sandbox, first on PATH
}

// AgentSandbox owns the per-session sandbox containers of one worker.
type AgentSandbox struct {
	cli         *client.Client
	image       string
	toolsMount  *mount.Mount
	toolsTarget string
	ownerID     func() string
	logger      Logger

	mu       sync.Mutex
	sessions map[string]*sandboxSession
}

type sandboxSession struct {
	mu          sync.Mutex
	containerID string
	closed      bool
}

// NewAgentSandbox builds the sandbox on the runtime's Docker client. It fails
// when the engine does not answer, so the caller never advertises a sandbox
// it cannot deliver.
func NewAgentSandbox(ctx context.Context, rt *DockerRuntime, opts AgentSandboxOptions) (*AgentSandbox, error) {
	if rt == nil || rt.cli == nil {
		return nil, fmt.Errorf("docker runtime unavailable")
	}
	if _, err := rt.cli.Ping(ctx); err != nil {
		return nil, fmt.Errorf("docker engine unreachable: %w", err)
	}
	self := inspectSelfContainer(ctx, rt.cli)
	target := sandboxToolsTarget(opts.ToolPath)
	ownerID := opts.OwnerID
	if ownerID == nil {
		ownerID = func() string { return "" }
	}
	return &AgentSandbox{
		cli:         rt.cli,
		image:       resolveSandboxImage(opts.Image, self),
		toolsMount:  resolveSandboxToolsMount(opts.ToolsSource, opts.ToolPath, target, self),
		toolsTarget: target,
		ownerID:     ownerID,
		logger:      rt.logger,
		sessions:    make(map[string]*sandboxSession),
	}, nil
}

// Image returns the resolved sandbox image (for startup logging).
func (s *AgentSandbox) Image() string { return s.image }

// ToolsMount returns the resolved tools mount, nil when none.
func (s *AgentSandbox) ToolsMount() *mount.Mount { return s.toolsMount }

// inspectSelfContainer returns the worker's own container when it runs in
// one. Docker sets the hostname to the short container id; the id/hostname
// cross-check keeps a host whose name happens to match some container from
// adopting that container's image and mounts.
func inspectSelfContainer(ctx context.Context, cli *client.Client) *types.ContainerJSON {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return nil
	}
	j, err := cli.ContainerInspect(ctx, hostname)
	if err != nil || j.ContainerJSONBase == nil || j.Config == nil {
		return nil
	}
	if !strings.HasPrefix(j.ID, hostname) && j.Config.Hostname != hostname {
		return nil
	}
	return &j
}

// resolveSandboxImage: explicit override > the worker's own image (by id, so
// it is the exact image already present on the engine) > the default tag.
func resolveSandboxImage(override string, self *types.ContainerJSON) string {
	if override != "" {
		return override
	}
	if self != nil && self.ContainerJSONBase != nil {
		if self.Image != "" {
			return self.Image
		}
		if self.Config != nil && self.Config.Image != "" {
			return self.Config.Image
		}
	}
	return agentSandboxDefaultImage
}

// sandboxToolsTarget is the tool dir inside the sandbox: the worker's own
// path so tool paths in agent prompts stay valid, unless it is not a POSIX
// path (Windows host worker).
func sandboxToolsTarget(toolPath string) string {
	if strings.HasPrefix(toolPath, "/") {
		return toolPath
	}
	return agentSandboxToolsFallback
}

// resolveSandboxToolsMount decides what backs the read-only tools mount:
//   - override: absolute path = bind, anything else = volume name;
//   - containerized worker: the worker's own mount at the tool path (volume
//     name for volumes, Source for binds); none = tools live in the worker's
//     image layer and cannot be shared, so no mount;
//   - host worker: the host tool path itself.
func resolveSandboxToolsMount(override, toolPath, target string, self *types.ContainerJSON) *mount.Mount {
	ro := func(t mount.Type, src string) *mount.Mount {
		return &mount.Mount{Type: t, Source: src, Target: target, ReadOnly: true}
	}
	if override != "" {
		if isAbsHostPath(override) {
			return ro(mount.TypeBind, override)
		}
		return ro(mount.TypeVolume, override)
	}
	if self != nil {
		for _, m := range self.Mounts {
			if m.Destination != toolPath {
				continue
			}
			switch m.Type {
			case mount.TypeVolume:
				if m.Name != "" {
					return ro(mount.TypeVolume, m.Name)
				}
			case mount.TypeBind:
				if m.Source != "" {
					return ro(mount.TypeBind, m.Source)
				}
			}
		}
		return nil
	}
	if toolPath == "" {
		return nil
	}
	return ro(mount.TypeBind, toolPath)
}

// isAbsHostPath accepts POSIX and Windows absolute paths regardless of the
// worker's own OS: the engine host decides how the bind source is read.
func isAbsHostPath(p string) bool {
	if strings.HasPrefix(p, "/") || strings.HasPrefix(p, `\\`) {
		return true
	}
	return len(p) >= 3 && p[1] == ':' && (p[2] == '\\' || p[2] == '/')
}

// agentSandboxEnv is the complete environment of sandboxed commands.
func agentSandboxEnv(toolsTarget string) []string {
	if toolsTarget == "" {
		toolsTarget = agentSandboxToolsFallback
	}
	return []string{
		"PATH=" + toolsTarget + ":" + agentSandboxBasePath,
		"HOME=" + agentSandboxWorkdir,
	}
}

// agentSandboxExecCmd wraps an agent command for exec. `env -i` drops the
// image's baked-in ENV (the worker image sets WORKER_* defaults, and a custom
// image could bake anything), so the command sees only agentSandboxEnv.
func agentSandboxExecCmd(toolsTarget, command string) []string {
	cmd := append([]string{"env", "-i"}, agentSandboxEnv(toolsTarget)...)
	return append(cmd, "sh", "-c", fmt.Sprintf("(%s) 2>&1", command))
}

// BuildAgentSandboxConfig is the full container definition of a session
// sandbox. Pure so the hardening is unit-testable without an engine.
//
// Env is built from scratch — never the worker's — so the API key, connector
// token and token-file path cannot leak. No docker.sock, no state mount, no
// host binds besides the read-only tools mount. Workspace and /tmp are
// size-capped tmpfs, so session files die with the container.
func BuildAgentSandboxConfig(spec AgentSandboxSpec) (*container.Config, *container.HostConfig) {
	labels := map[string]string{
		AgentSandboxLabel:        "true",
		agentSandboxSessionLabel: spec.SessionID,
	}
	if spec.OwnerID != "" {
		labels[agentSandboxOwnerLabel] = spec.OwnerID
	}
	cfg := &container.Config{
		Image:      spec.Image,
		Entrypoint: []string{"sleep", "infinity"},
		User:       agentSandboxUser,
		WorkingDir: agentSandboxWorkdir,
		Env:        agentSandboxEnv(spec.ToolsTarget),
		Labels:     labels,
	}
	pids := int64(agentSandboxPidsLimit)
	hc := &container.HostConfig{
		NetworkMode:    "bridge",
		ReadonlyRootfs: true,
		CapDrop:        []string{"ALL"},
		SecurityOpt:    []string{"no-new-privileges:true"},
		Tmpfs: map[string]string{
			agentSandboxWorkdir: "rw,nosuid,nodev,size=512m,mode=1777",
			"/tmp":              "rw,nosuid,nodev,size=256m,mode=1777",
		},
		Resources: container.Resources{
			PidsLimit:  &pids,
			Memory:     agentSandboxMemory,
			MemorySwap: agentSandboxMemory,
			NanoCPUs:   agentSandboxNanoCPUs,
		},
	}
	if spec.ToolsMount != nil {
		hc.Mounts = []mount.Mount{*spec.ToolsMount}
	}
	return cfg, hc
}

// Exec runs command in the session's sandbox (created on first use) and
// streams its combined output to out in arrival order. It returns the real
// exit code. Cancelling ctx removes the session container so the command
// stops; the next command of that session gets a fresh container.
func (s *AgentSandbox) Exec(ctx context.Context, sessionID, command string, out func([]byte) error) (int, error) {
	containerID, err := s.ensure(ctx, sessionID)
	if err != nil {
		return -1, err
	}
	created, err := s.execCreate(ctx, containerID, command)
	if err != nil && isContainerGone(err) {
		// Removed or stopped outside this session (prune, OOM, a sibling
		// worker's orphan sweep): replace it once instead of failing every
		// later command of the session
		s.forget(sessionID, containerID)
		if containerID, err = s.ensure(ctx, sessionID); err != nil {
			return -1, err
		}
		created, err = s.execCreate(ctx, containerID, command)
	}
	if err != nil {
		return -1, fmt.Errorf("sandbox exec create: %w", err)
	}
	att, err := s.cli.ContainerExecAttach(ctx, created.ID, types.ExecStartCheck{})
	if err != nil {
		return -1, fmt.Errorf("sandbox exec attach: %w", err)
	}
	defer att.Close()

	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			cctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			_ = s.Close(cctx, sessionID)
			cancel()
			att.Close()
		case <-done:
		}
	}()

	w := &sandboxOutputWriter{out: out}
	_, copyErr := stdcopy.StdCopy(w, w, att.Reader)
	if ctx.Err() != nil {
		return -1, ctx.Err()
	}
	if w.err != nil {
		return -1, w.err
	}
	if copyErr != nil && !errors.Is(copyErr, io.EOF) {
		return -1, fmt.Errorf("sandbox exec output: %w", copyErr)
	}
	return s.execExitCode(ctx, created.ID)
}

func (s *AgentSandbox) execCreate(ctx context.Context, containerID, command string) (types.IDResponse, error) {
	return s.cli.ContainerExecCreate(ctx, containerID, types.ExecConfig{
		User:         agentSandboxUser,
		WorkingDir:   agentSandboxWorkdir,
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          agentSandboxExecCmd(s.toolsTarget, command),
	})
}

// isContainerGone reports an exec-create failure caused by the container
// no longer existing or running.
func isContainerGone(err error) bool {
	return errdefs.IsNotFound(err) || errdefs.IsConflict(err) ||
		strings.Contains(err.Error(), "is not running")
}

// forget drops the session's cached container if it is still containerID,
// removing whatever is left of it, so the next ensure creates a new one.
func (s *AgentSandbox) forget(sessionID, containerID string) {
	s.mu.Lock()
	sess, ok := s.sessions[sessionID]
	s.mu.Unlock()
	if !ok {
		return
	}
	sess.mu.Lock()
	if sess.containerID == containerID {
		sess.containerID = ""
	}
	sess.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = s.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
	s.logWarning("agent sandbox: container %s of session %s was gone, replacing it", shortID(containerID), sessionID)
}

// execExitCode reads the exit code once the exec has finished. The output
// stream can close a moment before the engine marks the exec stopped, so a
// still-Running exec is polled briefly instead of reporting a bogus 0.
func (s *AgentSandbox) execExitCode(ctx context.Context, execID string) (int, error) {
	for i := 0; ; i++ {
		insp, err := s.cli.ContainerExecInspect(ctx, execID)
		if err != nil {
			return -1, fmt.Errorf("sandbox exec inspect: %w", err)
		}
		if !insp.Running || i >= 50 {
			return insp.ExitCode, nil
		}
		select {
		case <-ctx.Done():
			return -1, ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
}

// sandboxOutputWriter forwards demuxed output chunks; a send failure aborts
// the copy and is reported instead of the copy error.
type sandboxOutputWriter struct {
	out func([]byte) error
	err error
}

func (w *sandboxOutputWriter) Write(p []byte) (int, error) {
	if w.err != nil {
		return 0, w.err
	}
	chunk := make([]byte, len(p))
	copy(chunk, p)
	if err := w.out(chunk); err != nil {
		w.err = err
		return 0, err
	}
	return len(p), nil
}

// ensure returns the session's running container, creating it on first use.
// The per-session lock serializes concurrent first commands of one session.
func (s *AgentSandbox) ensure(ctx context.Context, sessionID string) (string, error) {
	s.mu.Lock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		sess = &sandboxSession{}
		s.sessions[sessionID] = sess
	}
	s.mu.Unlock()

	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.closed {
		return "", ErrSandboxSessionClosed
	}
	if sess.containerID != "" {
		return sess.containerID, nil
	}
	id, err := s.create(ctx, sessionID)
	if err != nil {
		return "", err
	}
	sess.containerID = id
	return id, nil
}

func (s *AgentSandbox) create(ctx context.Context, sessionID string) (string, error) {
	if err := s.ensureImage(ctx); err != nil {
		return "", err
	}
	cfg, hc := BuildAgentSandboxConfig(AgentSandboxSpec{
		Image:       s.image,
		SessionID:   sessionID,
		OwnerID:     s.ownerID(),
		ToolsMount:  s.toolsMount,
		ToolsTarget: s.toolsTarget,
	})
	name := agentSandboxName(sessionID)
	resp, err := s.cli.ContainerCreate(ctx, cfg, hc, nil, nil, name)
	if err != nil && errdefs.IsConflict(err) {
		resp, err = s.cli.ContainerCreate(ctx, cfg, hc, nil, nil, agentSandboxName(sessionID))
	}
	if err != nil {
		return "", fmt.Errorf("sandbox create: %w", err)
	}
	if err := s.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		_ = s.cli.ContainerRemove(context.Background(), resp.ID, container.RemoveOptions{Force: true})
		return "", fmt.Errorf("sandbox start: %w", err)
	}
	s.logInfo("agent sandbox: started %s for session %s (image %s)", shortID(resp.ID), sessionID, s.image)
	return resp.ID, nil
}

// ensureImage pulls the sandbox image only when the engine lacks it.
func (s *AgentSandbox) ensureImage(ctx context.Context) error {
	if _, _, err := s.cli.ImageInspectWithRaw(ctx, s.image); err == nil {
		return nil
	}
	s.logInfo("agent sandbox: pulling image %s", s.image)
	r, err := s.cli.ImagePull(ctx, s.image, types.ImagePullOptions{})
	if err != nil {
		return fmt.Errorf("sandbox image pull %s: %w", s.image, err)
	}
	_, _ = io.Copy(io.Discard, r)
	r.Close()
	if _, _, err := s.cli.ImageInspectWithRaw(ctx, s.image); err != nil {
		return fmt.Errorf("sandbox image %s unavailable after pull: %w", s.image, err)
	}
	return nil
}

// agentSandboxName is oasm-agent-<session-slug>-<rand4>.
func agentSandboxName(sessionID string) string {
	slug := sanitizeToolName(sessionID)
	if len(slug) > 40 {
		slug = strings.Trim(slug[:40], "-")
	}
	return fmt.Sprintf("oasm-agent-%s-%s", slug, randHex4())
}

// Close force-removes the session's container. Safe to call repeatedly and
// concurrently with Exec: a command racing the close gets
// ErrSandboxSessionClosed instead of resurrecting the container.
func (s *AgentSandbox) Close(ctx context.Context, sessionID string) error {
	s.mu.Lock()
	sess, ok := s.sessions[sessionID]
	delete(s.sessions, sessionID)
	s.mu.Unlock()
	if !ok {
		return nil
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	sess.closed = true
	if sess.containerID == "" {
		return nil
	}
	id := sess.containerID
	sess.containerID = ""
	if err := s.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: true}); err != nil && !errdefs.IsNotFound(err) {
		return fmt.Errorf("sandbox remove %s: %w", shortID(id), err)
	}
	s.logInfo("agent sandbox: removed %s for session %s", shortID(id), sessionID)
	return nil
}

// CloseAll removes every session container (worker shutdown).
func (s *AgentSandbox) CloseAll(ctx context.Context) {
	s.mu.Lock()
	ids := make([]string, 0, len(s.sessions))
	for id := range s.sessions {
		ids = append(ids, id)
	}
	s.mu.Unlock()
	for _, id := range ids {
		if err := s.Close(ctx, id); err != nil {
			s.logWarning("agent sandbox: %v", err)
		}
	}
}

// ReconcileOrphans removes sandbox containers a previous run of this worker
// left behind (crash, kill -9), plus any terminal-state sandbox. A live
// sandbox of another owner may belong to a sibling worker on a shared engine
// and is kept. Call once at startup, before the remote execute stream opens.
func (s *AgentSandbox) ReconcileOrphans(ctx context.Context, ownerID string) (removed int) {
	f := filters.NewArgs()
	f.Add("label", AgentSandboxLabel+"=true")
	list, err := s.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		s.logWarning("agent sandbox: orphan list failed: %v", err)
		return 0
	}
	for _, c := range list {
		ours := ownerID != "" && c.Labels[agentSandboxOwnerLabel] == ownerID
		if !ours && !isTerminalState(c.State) {
			continue
		}
		if err := s.cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true}); err != nil {
			s.logWarning("agent sandbox: orphan remove %s failed: %v", shortID(c.ID), err)
			continue
		}
		removed++
	}
	if removed > 0 {
		s.logInfo("agent sandbox: removed %d orphan sandbox container(s)", removed)
	}
	return removed
}

func (s *AgentSandbox) logInfo(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Info(msg, args...)
	}
}

func (s *AgentSandbox) logWarning(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Warning(msg, args...)
	}
}
