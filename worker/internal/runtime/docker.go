package runtime

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
	"github.com/docker/docker/errdefs"
)

// DockerRuntime implements ExecutionRuntime via Docker Engine API over docker.sock.
// ponytail: no CLI, no docker binary exec, only Engine API via github.com/docker/docker/client.
type DockerRuntime struct {
	cli            *client.Client
	host           string // e.g. unix:///var/run/docker.sock (from WORKER_DOCKER_HOST)
	connectorAddr  string // resolved dial address containers use to reach the worker's connector gRPC server
	connectorToken string // shared secret for connector authentication
	logger         Logger

	// poolEnabled switches container naming to the stable pool form
	// (oasm-<tool>-<hash8(image)>) and makes Create reuse a live container of
	// the same image instead of always spawning a fresh one.
	poolEnabled bool
}

// Logger receives DockerRuntime lifecycle log lines (image pull, create, start,
// stop, remove). TuiLogger (worker package) satisfies it structurally.
// A nil logger disables logging (safe).
type Logger interface {
	Info(msg string, args ...any)
	Warning(msg string, args ...any)
}

// SetLogger wires a lifecycle logger. Nil disables logging (safe).
func (d *DockerRuntime) SetLogger(l Logger) {
	d.logger = l
}

// SetPoolEnabled toggles pooled container naming/reuse. Must be called before
// any Create. Pooling off keeps the legacy random-suffix 1:1 behavior.
func (d *DockerRuntime) SetPoolEnabled(enabled bool) {
	d.poolEnabled = enabled
}

func (d *DockerRuntime) logInfo(msg string, args ...any) {
	if d.logger != nil {
		d.logger.Info(msg, args...)
	}
}

func (d *DockerRuntime) logWarning(msg string, args ...any) {
	if d.logger != nil {
		d.logger.Warning(msg, args...)
	}
}

// resolveHost resolves the Docker engine endpoint with precedence:
// explicit host arg > WORKER_DOCKER_HOST env > existing DOCKER_HOST env > platform default.
func resolveHost(host, dockerHostEnv, workerDockerHostEnv, goos string) string {
	if host != "" {
		return host
	}
	if workerDockerHostEnv != "" {
		return workerDockerHostEnv
	}
	if dockerHostEnv != "" {
		return dockerHostEnv
	}
	if goos == "windows" {
		return "npipe:////./pipe/docker_engine"
	}
	return "unix:///var/run/docker.sock"
}

// NewDockerRuntime creates a DockerRuntime dialing via docker.sock.
// host defaults to npipe on Windows / unix socket elsewhere; WORKER_DOCKER_HOST
// and DOCKER_HOST env override an empty host (see resolveHost).
// A pre-set DOCKER_HOST is never clobbered: the resolved host is passed to the
// client explicitly instead of being written into the process environment.
// connectorAddr is an explicit override for the address containers dial the
// connector server on (precedence: connectorAddr arg > WORKER_CONNECTOR_ADDR
// env > auto-derive, see resolveConnectorAddr); pass "" to auto-derive.
// connectorPort is the listen port of the worker's connector gRPC server.
func NewDockerRuntime(host string, connectorAddr string, connectorPort int, connectorToken string) (*DockerRuntime, error) {
	host = resolveHost(host, os.Getenv("DOCKER_HOST"), os.Getenv("WORKER_DOCKER_HOST"), runtime.GOOS)
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithHost(host), client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	// Config (cfg.ConnectorAddr, populated from WORKER_CONNECTOR_ADDR by viper)
	// wins over a direct env read, which is kept as a fallback for standalone
	// runtime users. Both carry the same value in the normal worker path.
	override := connectorAddr
	if override == "" {
		override = os.Getenv("WORKER_CONNECTOR_ADDR")
	}
	hostname, _ := os.Hostname()
	addr, err := resolveConnectorAddr(context.Background(), cli, hostname, override, connectorPort, runtime.GOOS)
	if err != nil {
		return nil, err
	}
	return &DockerRuntime{
		cli:            cli,
		host:           host,
		connectorAddr:  addr,
		connectorToken: connectorToken,
	}, nil
}

// dockerInspector is the Docker Engine API subset needed to auto-derive the
// connector address. Satisfied by *client.Client.
type dockerInspector interface {
	ContainerInspect(ctx context.Context, containerID string) (types.ContainerJSON, error)
	NetworkInspect(ctx context.Context, networkID string, options types.NetworkInspectOptions) (types.NetworkResource, error)
	ServerVersion(ctx context.Context) (types.Version, error)
}

// resolveConnectorAddr derives the address connector containers use to dial the
// worker's connector gRPC server. Precedence:
//  1. override (cfg.ConnectorAddr / WORKER_CONNECTOR_ADDR) — used as-is when
//     non-empty; this is the only supported way to dial over IPv6 (bracketed,
//     e.g. [fdc4:...]:26276);
//  2. worker itself inside docker (hostname inspectable with an IPv4
//     bridge-network IP) — spawned containers (nil network = default bridge)
//     reach it directly;
//  3. host-terminal: host.docker.internal on every OS. Docker Desktop
//     (windows/darwin) resolves it via its built-in mapping; on linux the name
//     resolves only when the container carries the
//     host.docker.internal:host-gateway ExtraHosts entry — Create adds it
//     unconditionally, and it works on engines supporting host-gateway
//     (API >= 1.41 / Engine 20.10+, see supportsHostGateway);
//  4. linux on engines predating host-gateway support (API < 1.41 or
//     unreadable): the bridge network's IPv4 gateway, falling back to
//     172.17.0.1.
//
// IPv6 gateways in the bridge IPAM (e.g. the fdc4:... ULA Docker Engine 27+
// adds) are never auto-selected: default-bridge containers have no IPv6 route,
// so such a dial fails with "network is unreachable".
func resolveConnectorAddr(ctx context.Context, di dockerInspector, hostname, override string, port int, goos string) (string, error) {
	if override != "" {
		return override, nil
	}
	portStr := strconv.Itoa(port)

	if hostname != "" && di != nil {
		if j, err := di.ContainerInspect(ctx, hostname); err == nil && j.NetworkSettings != nil {
			if ep, ok := j.NetworkSettings.Networks["bridge"]; ok && ep != nil && ep.IPAddress != "" {
				if ip := net.ParseIP(ep.IPAddress); ip != nil && ip.To4() != nil {
					return net.JoinHostPort(ep.IPAddress, portStr), nil
				}
			}
		}
	}

	// Host-terminal worker: the stable host.docker.internal name works on every
	// OS. Desktop provides the mapping out of the box; on linux it is
	// guaranteed by the host-gateway ExtraHosts entry Create adds — when the
	// engine supports it. Older engines fall through to the bridge gateway.
	if goos == "windows" || goos == "darwin" {
		return net.JoinHostPort("host.docker.internal", portStr), nil
	}
	if di != nil {
		if v, err := di.ServerVersion(ctx); err == nil && supportsHostGateway(v.APIVersion) {
			return net.JoinHostPort("host.docker.internal", portStr), nil
		}
	}

	if di != nil {
		if nr, err := di.NetworkInspect(ctx, "bridge", types.NetworkInspectOptions{}); err == nil {
			for _, cfg := range nr.IPAM.Config {
				if cfg.Gateway == "" {
					continue
				}
				// Prefer an IPv4 gateway; skip IPv6-only entries (ULA or not).
				if ip := net.ParseIP(cfg.Gateway); ip != nil && ip.To4() != nil {
					return net.JoinHostPort(cfg.Gateway, portStr), nil
				}
			}
		}
	}

	return net.JoinHostPort("172.17.0.1", portStr), nil
}

// supportsHostGateway reports whether the engine resolves the special
// host-gateway value in ExtraHosts (Docker Engine 20.10+, API >= 1.41 — Docker
// Desktop ships 20.10+ since 2020, so the desktop built-in mapping is the
// relevant mechanism there regardless). An unreadable version string is treated
// as unsupported so the caller falls back to the bridge gateway, which works on
// every engine.
func supportsHostGateway(apiVersion string) bool {
	major, minor, ok := strings.Cut(apiVersion, ".")
	if !ok {
		return false
	}
	maj, errM := strconv.Atoi(major)
	min, errM2 := strconv.Atoi(minor)
	if errM != nil || errM2 != nil {
		return false
	}
	return maj > 1 || (maj == 1 && min >= 41)
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

// sanitizeToolName normalizes a tool name into Docker's container name charset
// ([a-z0-9_.-]): lowercase, invalid runes collapse to '-', truncated to 80
// chars so the final name stays well under Docker's 128-char limit.
func sanitizeToolName(tool string) string {
	t := strings.ToLower(tool)
	var b strings.Builder
	b.Grow(len(t))
	dash := false
	for _, r := range t {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
			dash = false
		default:
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		s = "tool"
	}
	if len(s) > 80 {
		s = s[:80]
	}
	return s
}

// randHex4 returns 4 lowercase hex chars from crypto/rand (name collision suffix).
func randHex4() string {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// buildContainerName builds the container name oasm-<tool>-<exec8>-<rand4>.
// The random suffix keeps concurrent creates of the same tool collision-free;
// a 409 Conflict (stale container holding the name) is retried once with a
// fresh suffix in Create.
func buildContainerName(tool, execID string) string {
	short := execID
	if len(short) > 8 {
		short = short[:8]
	}
	return fmt.Sprintf("oasm-%s-%s-%s", sanitizeToolName(tool), short, randHex4())
}

// buildPoolContainerName builds the stable pooled name oasm-<tool>-<hash8(image)>.
// Deterministic per image so consecutive jobs of the same image reuse one
// container; the 8-hex hash (sha256 prefix) disambiguates images without
// leaking the full registry ref into the name.
func buildPoolContainerName(tool, image string) string {
	sum := sha256.Sum256([]byte(image))
	return fmt.Sprintf("oasm-%s-%s", sanitizeToolName(tool), hex.EncodeToString(sum[:4]))
}

// pooledHandleFromName inspects a container by its pooled name and returns a
// usable Handle when it is a live oasm-managed container (reuse path — skips
// pull/create/start). A same-named container that is NOT a live managed one is
// force-removed first (stale leftover), so the caller can create fresh under
// the same stable name.
func (d *DockerRuntime) pooledHandleFromName(ctx context.Context, name string, opts RuntimeOpts, spec JobSpec) (Handle, bool) {
	j, err := d.cli.ContainerInspect(ctx, name)
	if err != nil {
		return Handle{}, false // nothing holds the name — caller creates fresh
	}
	managed := j.Config != nil && j.Config.Labels != nil && j.Config.Labels["oasm-managed"] == "true"
	if !managed && (j.Config == nil || j.Config.Labels == nil || len(j.Config.Labels) == 0) {
		// Name unregistered (no oasm labels): genuinely fresh, skip removal.
		return Handle{}, false
	}
	if !managed || !j.State.Running {
		if err := d.cli.ContainerRemove(context.Background(), j.ID, container.RemoveOptions{Force: true}); err != nil {
			d.logWarning("docker: remove stale pooled container %s: %v", j.ID, err)
		}
		return Handle{}, false
	}
	d.logInfo("docker: pool hit, reusing running container: %s name=%s image=%s", j.ID, name, spec.Image)
	return Handle{
		ID: j.ID,
		Labels: map[string]string{
			"trace_id": opts.TraceID,
			"tool":     spec.Tool,
			"exec_id":  j.Config.Labels["exec_id"],
		},
	}, true
}

// SweepOrphans removes oasm-managed containers not referenced by keep — stale
// leftovers from crashed workers/connectors. Pooling disabled: no-op (legacy
// naming manages no containers).
func (d *DockerRuntime) SweepOrphans(ctx context.Context, keep []string) (int, error) {
	if d.cli == nil || !d.poolEnabled {
		return 0, nil
	}
	args := filters.NewArgs(filters.Arg("label", "oasm-managed=true"))
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: args})
	if err != nil {
		return 0, err
	}
	keepSet := make(map[string]struct{}, len(keep))
	for _, id := range keep {
		keepSet[id] = struct{}{}
	}
	removed := 0
	for _, c := range list {
		if _, ok := keepSet[c.ID]; ok {
			continue
		}
		if err := d.cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true}); err != nil {
			if !errdefs.IsNotFound(err) {
				d.logWarning("docker: orphan sweep remove %s: %v", c.ID, err)
			}
			continue
		}
		removed++
		d.logInfo("docker: swept orphan container: %s", c.ID)
	}
	return removed, nil
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

	// Build env vars for the container. Prefer the caller-supplied execID
	// (Manager's exec-N, single source of truth) so connector registration
	// matches the proxy's pending/stream key; fall back to a random hex id
	// for direct runtime users (legacy behavior).
	execID := spec.ExecID
	if execID == "" {
		execID = generateExecID()
	}
	env := buildContainerEnv(spec, d.connectorAddr, d.connectorToken, execID)

	// Container config: image, env, labels for lifecycle management.
	config := &container.Config{
		Image: spec.Image,
		Env:   env,
		Labels: map[string]string{
			"trace_id":     opts.TraceID,
			"tool":         spec.Tool,
			"exec_id":      execID,
			"oasm-managed": "true",
		},
	}

	// Host config: resource limits + security hardening.
	// CPU: opts.CPU in millicores → NanoCPUs (1 millicore = 1e6 nanocpus).
	// Memory: opts.Memory in MB → bytes. MemorySwap = Memory disables swap.
	// ExtraHosts maps host.docker.internal → host-gateway so connector
	// containers can dial the worker's connector gRPC server from inside the
	// container on any host: Engine 20.10+ resolves host-gateway to the host,
	// and Docker Desktop ignores the duplicate of its built-in name (harmless).
	// Added unconditionally — on linux there is no built-in mapping; on
	// windows/darwin the entry is a no-op.
	// ponytail: if an engine predating host-gateway ever errors on this entry,
	// gate it by OS (skip on windows/darwin) before retrying create.
	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			NanoCPUs:   int64(opts.CPU) * 1e6,
			Memory:     int64(opts.Memory) * 1024 * 1024,
			MemorySwap: int64(opts.Memory) * 1024 * 1024,
		},
		SecurityOpt:    []string{"no-new-privileges:true"},
		ReadonlyRootfs: false, // connectors may need to write temp files
		ExtraHosts:     []string{"host.docker.internal:host-gateway"},
	}

	name := buildContainerName(spec.Tool, execID)
	if d.poolEnabled {
		// Pooled mode: deterministic per-image name + reuse of a live
		// oasm-managed container so N same-image jobs share one container.
		// Reuse skips pull/create/start entirely.
		pname := buildPoolContainerName(spec.Tool, spec.Image)
		if h, ok := d.pooledHandleFromName(ctx, pname, opts, spec); ok {
			return h, nil
		}
		name = pname
	}

	// Pull image if not present locally.
	pullReader, err := d.cli.ImagePull(ctx, spec.Image, types.ImagePullOptions{})
	if err != nil {
		return Handle{}, fmt.Errorf("image pull %s: %w", spec.Image, err)
	}
	// Drain the pull output (required to complete the pull).
	_, _ = io.Copy(io.Discard, pullReader)
	pullReader.Close()
	d.logInfo("docker: image pull done: %s", spec.Image)

	resp, err := d.cli.ContainerCreate(ctx, config, hostConfig, nil, nil, name)
	if err != nil {
		if errdefs.IsConflict(err) {
			if d.poolEnabled {
				// Name held by a stale/foreign container: reuse it when it is a
				// live oasm-managed container (race with a sibling create),
				// otherwise remove and retry under the same stable name.
				if h, ok := d.pooledHandleFromName(ctx, name, opts, spec); ok {
					return h, nil
				}
				d.logInfo("docker: pool name conflict, removing stale container and retrying: %v", err)
			} else {
				// Legacy: retry once with a fresh random suffix.
				d.logInfo("docker: container name conflict, retrying with fresh suffix: %v", err)
				name = buildContainerName(spec.Tool, execID)
			}
			resp, err = d.cli.ContainerCreate(ctx, config, hostConfig, nil, nil, name)
		}
		if err != nil {
			return Handle{}, fmt.Errorf("container create: %w", err)
		}
	}

	containerID := resp.ID
	d.logInfo("docker: container created: %s exec=%s job=%s tool=%s grpc=%s", containerID, execID, spec.JobID, spec.Tool, d.connectorAddr)

	// Start the container. Clean up on failure so we don't leak containers.
	if err := d.cli.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		_ = d.cli.ContainerRemove(context.Background(), containerID, container.RemoveOptions{Force: true})
		return Handle{}, fmt.Errorf("container start: %w", err)
	}
	d.logInfo("docker: container started: %s exec=%s job=%s", containerID, execID, spec.JobID)

	return Handle{
		ID: containerID,
		Labels: map[string]string{
			"trace_id": opts.TraceID,
			"tool":     spec.Tool,
			"exec_id":  execID,
		},
	}, nil
}

// Start starts the container unless it is already running. Create already
// starts the container and Manager.Submit calls Start right after Create, so
// an unconditional second ContainerStart would be a redundant (racy) double
// start. Inspect-first keeps Start safe for both paths: no-op when running,
// real start when stopped.
func (d *DockerRuntime) Start(ctx context.Context, h Handle) error {
	if d.cli == nil {
		return fmt.Errorf("docker client not initialized")
	}
	if res, err := d.Inspect(ctx, h); err == nil && res.Running {
		return nil
	}
	return d.cli.ContainerStart(ctx, h.ID, container.StartOptions{})
}

func (d *DockerRuntime) Stop(ctx context.Context, h Handle) error {
	if d.cli == nil {
		return fmt.Errorf("docker client not initialized")
	}
	d.logInfo("docker: stopping container %s", h.ID)
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
	res := InspectResult{Running: j.State.Running, ExitCode: j.State.ExitCode}
	if j.State.Health != nil {
		res.Health = j.State.Health.Status
	}
	return res, nil
}

// Logs streams the container's combined stdout+stderr as line chunks until
// the context is cancelled or the stream ends. Non-TTY containers return a
// multiplexed stream (8-byte header + payload per frame) when both streams
// are requested; the 8-byte header is stripped here so the caller sees plain
// lines. The read goroutine exits when ctx is cancelled (docker client aborts
// the request) or the stream closes — it never blocks on the send side
// (ctx-aware select) and the channel is always closed on exit.
func (d *DockerRuntime) Logs(ctx context.Context, h Handle) (<-chan []byte, error) {
	if d.cli == nil {
		return nil, fmt.Errorf("docker client not initialized")
	}
	rc, err := d.cli.ContainerLogs(ctx, h.ID, types.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
	})
	if err != nil {
		return nil, err
	}
	ch := make(chan []byte, 16)
	go func() {
		defer rc.Close()
		defer close(ch)
		br := bufio.NewReaderSize(rc, 32*1024)
		w := &lineChunkWriter{ctx: ctx, ch: ch}
		for {
			hdr := make([]byte, 8)
			if _, err := io.ReadFull(br, hdr); err != nil {
				// Stream ended or ctx cancelled.
				w.flush()
				return
			}
			payloadLen := binary.BigEndian.Uint32(hdr[4:8])
			payload := make([]byte, payloadLen)
			if _, err := io.ReadFull(br, payload); err != nil {
				w.flush()
				return
			}
			if w.write(payload) {
				// ctx cancelled mid-stream.
				return
			}
		}
	}()
	return ch, nil
}

// lineChunkWriter splits demuxed payload bytes into lines and delivers them
// to the channel. Sends are ctx-aware so a stopped consumer cannot leak the
// read goroutine.
type lineChunkWriter struct {
	ctx context.Context
	ch  chan<- []byte
	buf []byte
}

func (w *lineChunkWriter) write(p []byte) bool {
	w.buf = append(w.buf, p...)
	for {
		idx := bytesIndexByte(w.buf, '\n')
		if idx < 0 {
			break
		}
		line := trimCR(w.buf[:idx])
		w.buf = w.buf[idx+1:]
		if len(line) == 0 {
			continue
		}
		if w.send(line) {
			return true // ctx cancelled mid-stream
		}
	}
	return false
}

func (w *lineChunkWriter) flush() {
	if len(w.buf) == 0 {
		return
	}
	line := trimCR(w.buf)
	w.buf = nil
	if len(line) > 0 {
		w.send(line)
	}
}

func (w *lineChunkWriter) send(line []byte) bool {
	select {
	case w.ch <- line:
		return false
	case <-w.ctx.Done():
		return true
	}
}

func bytesIndexByte(b []byte, c byte) int {
	for i, v := range b {
		if v == c {
			return i
		}
	}
	return -1
}

func trimCR(b []byte) []byte {
	for len(b) > 0 && (b[len(b)-1] == '\r' || b[len(b)-1] == '\n') {
		b = b[:len(b)-1]
	}
	return b
}

func (d *DockerRuntime) Cleanup(ctx context.Context, h Handle) error {
	if d.cli == nil {
		return nil
	}
	if err := d.cli.ContainerRemove(ctx, h.ID, container.RemoveOptions{Force: true}); err != nil {
		// Remove failure used to be swallowed silently; surface it as a warning
		// while keeping the nil-error contract (caller treats cleanup as best-effort).
		d.logWarning("docker: removed container %s: %v", h.ID, err)
		return nil
	}
	d.logInfo("docker: removed container %s", h.ID)
	return nil
}

// buildContainerEnv constructs the env var slice for a connector container.
// WORKER_GRPC_ADDR is the verbatim dial address (a bracketed IPv6 override
// stays bracketed); WORKER_GRPC_HOST/_PORT are the same address split for
// SDKs that need host and port separately (host is bare — brackets stripped).
// An address without a port (e.g. a bare service-name override) emits
// WORKER_GRPC_HOST only.
func buildContainerEnv(spec JobSpec, connectorAddr, connectorToken, execID string) []string {
	env := []string{
		"WORKER_GRPC_ADDR=" + connectorAddr,
		"WORKER_TOKEN=" + connectorToken,
		"EXECUTION_ID=" + execID,
		"JOB_ID=" + spec.JobID,
		"TOOL=" + spec.Tool,
		"TRACE_ID=" + spec.TraceID,
	}
	if host, port, err := net.SplitHostPort(connectorAddr); err == nil {
		env = append(env,
			"WORKER_GRPC_HOST="+host,
			"WORKER_GRPC_PORT="+port,
		)
	} else {
		env = append(env, "WORKER_GRPC_HOST="+connectorAddr)
	}

	// Inject connector config profile as OASM_CONFIG JSON when present.
	if len(spec.Config) > 0 {
		if b, err := json.Marshal(spec.Config); err == nil {
			env = append(env, "OASM_CONFIG="+string(b))
		} else {
			fmt.Fprintf(os.Stderr, "WARNING: failed to marshal OASM_CONFIG for job %s: %v\n", spec.JobID, err)
		}
	}

	// Inject connector inputs as INPUT_<KEY>=<VALUE> env vars.
	for k, v := range spec.Inputs {
		env = append(env, "INPUT_"+strings.ToUpper(k)+"="+fmt.Sprintf("%v", v))
	}

	return env
}
