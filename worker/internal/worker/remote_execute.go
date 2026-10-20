package worker

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	pb "oasm-worker/internal/gen/workers"

	"oasm-worker/internal/grpcclient"
	"oasm-worker/internal/runtime"
)

// agentCommandSandbox runs agent shell commands in an isolated per-session
// container (runtime.AgentSandbox). nil means the legacy host `sh -c` path.
type agentCommandSandbox interface {
	Exec(ctx context.Context, sessionID, command string, out func([]byte) error) (int, error)
	Close(ctx context.Context, sessionID string) error
}

// unavailableSandbox is the fail-closed stand-in used when the sandbox was
// requested but cannot run: every command errors instead of silently
// falling back to the host, where it could read the worker's secrets.
type unavailableSandbox struct{ err error }

func (u unavailableSandbox) Exec(context.Context, string, string, func([]byte) error) (int, error) {
	return -1, u.err
}

func (u unavailableSandbox) Close(context.Context, string) error { return nil }

// selectCommandSandbox picks how agent commands run: host exec when the
// sandbox is disabled, the sandbox when it initialized, else fail closed.
// Returns an untyped nil for the host path so callers can test against nil.
func selectCommandSandbox(enabled bool, sb *runtime.AgentSandbox, initErr error) agentCommandSandbox {
	if !enabled {
		return nil
	}
	if sb == nil {
		if initErr == nil {
			initErr = errors.New("docker runtime unavailable")
		}
		return unavailableSandbox{err: fmt.Errorf("agent sandbox unavailable: %w", initErr)}
	}
	return sb
}

// remoteResultSender is the subset of RemoteExecuteHandler a command uses to
// report its result.
type remoteResultSender interface {
	SendStdout(ctx context.Context, data []byte) error
	SendExit(ctx context.Context, exitCode int32) error
	SendError(ctx context.Context, errMsg string) error
}

type sessionSandbox struct {
	sessionID string
	rootPath  string              // host session dir; empty when containerized
	container agentCommandSandbox // non-nil: commands run in a sandbox container
	mu        sync.Mutex
}

func newSessionSandbox(workspaceRoot, sessionID string, container agentCommandSandbox) (*sessionSandbox, error) {
	if container != nil {
		// The container is created lazily on the first command; no host dir,
		// so nothing of the session ever lands on the worker's filesystem.
		return &sessionSandbox{sessionID: sessionID, container: container}, nil
	}

	sessionDir := filepath.Join(workspaceRoot, sessionID)

	// 0700: other sessions' commands run as the same OS user on this path.
	if err := os.MkdirAll(sessionDir, 0o700); err != nil {
		return nil, fmt.Errorf("failed to create session directory: %w", err)
	}

	return &sessionSandbox{
		sessionID: sessionID,
		rootPath:  sessionDir,
	}, nil
}

func (s *sessionSandbox) resolvePath(path string) (string, error) {
	if path == "" {
		return s.rootPath, nil
	}

	resolved := filepath.Clean(path)
	if !filepath.IsAbs(resolved) {
		resolved = filepath.Join(s.rootPath, resolved)
	}

	absResolved, err := filepath.Abs(resolved)
	if err != nil {
		return "", fmt.Errorf("failed to resolve absolute path: %w", err)
	}

	absRoot, err := filepath.Abs(s.rootPath)
	if err != nil {
		return "", fmt.Errorf("failed to resolve root path: %w", err)
	}

	if absResolved == absRoot {
		return absResolved, nil
	}

	if len(absResolved) <= len(absRoot) || absResolved[:len(absRoot)] != absRoot || absResolved[len(absRoot)] != filepath.Separator {
		return "", fmt.Errorf("path %q is outside session directory", path)
	}

	return absResolved, nil
}

func (s *sessionSandbox) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.container != nil {
		// Detached: the stream ctx is usually already cancelled here, and a
		// leaked sandbox would keep the session's files and processes alive.
		cctx, cancel := newDetachedCleanupContext()
		defer cancel()
		return s.container.Close(cctx, s.sessionID)
	}
	return os.RemoveAll(s.rootPath)
}

// startRemoteExecuteHandler serves the remote execute stream. cmdSandbox nil
// runs agent commands on the host; non-nil runs them through it (see
// selectCommandSandbox).
func startRemoteExecuteHandler(ctx context.Context, grpcClient *grpcclient.Client, workspaceRoot string, toolPath string, cmdSandbox agentCommandSandbox, browsers *agentBrowsers, events chan<- TuiEvent, runTool func(sessionID string, run *pb.ToolRun, send toolResultSender), cancelTool func(sessionID string) bool) {
	log := NewTuiLogger(events, "RemoteExec")
	remoteSem := make(chan struct{}, 16)

	// Sandboxed sessions live across stream reconnects and end on idle (see
	// sandboxSessions); host sessions stay per stream, as before.
	var sbSessions *sandboxSessions
	if cmdSandbox != nil {
		sbSessions = newSandboxSessions(sandboxIdleTTL, maxLiveSandboxes, func(sessionID string) {
			cctx, cancel := newDetachedCleanupContext()
			defer cancel()
			if err := cmdSandbox.Close(cctx, sessionID); err != nil {
				log.ErrorE("Failed to remove session sandbox", err)
			} else {
				log.Info("Cleaned up session sandbox: %s", sessionID)
			}
			Emit(events, TuiEvent{Type: EventSessionClosed, SessionID: sessionID})
		})
		defer sbSessions.closeAll()
	}

	for {
		select {
		case <-ctx.Done():
			log.Info("Remote execute handler shutting down")
			return
		default:
		}

		log.Info("Subscribing to remote execute stream...")

		handler, err := grpcClient.RemoteExecuteSubscribe(ctx)
		if err != nil {
			log.ErrorE("Failed to subscribe, retrying in 5s", err)

			timer := time.NewTimer(5 * time.Second)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
				continue
			}
		}

		log.Success("Remote execute stream connected (worker: %s)", grpcClient.WorkerID())

		activeSessions := make(map[string]*sessionSandbox)
		var sessionsMu sync.Mutex

		getOrCreateSandbox := func(sessionID string) (*sessionSandbox, error) {
			sessionsMu.Lock()
			defer sessionsMu.Unlock()

			if sb, ok := activeSessions[sessionID]; ok {
				return sb, nil
			}

			sb, err := newSessionSandbox(workspaceRoot, sessionID, cmdSandbox)
			if err != nil {
				return nil, err
			}

			activeSessions[sessionID] = sb
			if sb.container != nil {
				log.Info("Session sandbox: %s -> isolated container", sessionID)
			} else {
				log.Info("Session sandbox: %s -> %s", sessionID, sb.rootPath)
			}

			Emit(events, TuiEvent{
				Type:          EventSessionCreated,
				SessionID:     sessionID,
				SessionActive: true,
			})

			return sb, nil
		}

		for {
			resp, err := handler.Next(ctx)
			if err != nil {
				log.ErrorE("Remote execute event error, reconnecting", err)
				break
			}

			if resp == nil {
				log.Info("Remote execute stream closed, reconnecting")
				break
			}

			switch resp.Type {
			case pb.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTED:
				// Stream-level handshake from core. Core sends CONNECTED once at
				// subscribe time with empty session/command ids — no session
				// exists yet, so log the worker id instead (already known here).
				log.Success("Remote execute handshake confirmed (worker: %s)", grpcClient.WorkerID())

			case pb.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND:
				sessionID := resp.SessionId
				command := resp.Command

				if sessionID == "" || command == "" {
					log.Warning("Empty session or command field")
					_ = handler.SendError(ctx, "empty session or command")
					continue
				}

				if sbSessions != nil {
					startSandboxedCommand(ctx, handler, resp, sbSessions, cmdSandbox, remoteSem, events, toolPath)
					continue
				}

				sb, err := getOrCreateSandbox(sessionID)
				if err != nil {
					log.ErrorE("Failed to create session sandbox", err)
					_ = handler.SendError(ctx, fmt.Sprintf("failed to create session workspace: %v", err))
					continue
				}

				Emit(events, TuiEvent{
					Type:           EventSessionCommand,
					SessionID:      sessionID,
					SessionCommand: command,
				})

				// Capture ids at command-receive time to avoid misattribution if
				// Next() overwrites handler ids before the goroutine sends.
				cmdID := resp.Id
				cmdWorkerID := resp.WorkerId
				select {
				case remoteSem <- struct{}{}:
					go func(h *grpcclient.RemoteExecuteHandler, sid, cid, wid, cmd string, sbox *sessionSandbox) {
						defer func() { <-remoteSem }()
						executeRemoteCommand(ctx, h, sid, cid, wid, cmd, sbox, browsers, events, toolPath)
					}(handler, sessionID, cmdID, cmdWorkerID, command, sb)
				default:
					log.Warning("remote exec concurrency limit reached")
					_ = handler.SendErrorFor(ctx, sessionID, cmdID, cmdWorkerID, "server busy")
				}

			case pb.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_RUN_TOOL:
				run := resp.GetToolRun()
				sessionID, cmdID := resp.SessionId, resp.Id
				if sessionID == "" || run == nil {
					log.Warning("Agent tool run event without a session or tool")
					continue
				}
				log.Info("Agent tool run received: %s -> %s", run.GetTool(), run.GetTarget())
				h := handler
				runTool(sessionID, run, func(t pb.RemoteExecuteResultEventType, data []byte, exitCode int32) error {
					// Detached: the result must reach core even if this stream reconnects.
					sendCtx, cancel := newDetachedCleanupContext()
					defer cancel()
					return h.SendResultFor(sendCtx, sessionID, cmdID, t, data, exitCode)
				})

			case pb.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_CANCEL_TOOL:
				if cancelTool(resp.SessionId) {
					log.Info("Agent tool run cancelled: %s", resp.SessionId)
				}

			default:
				log.Warning("Unknown remote execute event type: %v", resp.Type)
			}
		}

		sessionsMu.Lock()
		for sessionID, sb := range activeSessions {
			if sb != nil {
				if err := sb.close(); err != nil {
					log.ErrorE("Failed to cleanup session sandbox", err)
				} else {
					log.Info("Cleaned up session sandbox: %s", sessionID)
				}
			}

			Emit(events, TuiEvent{
				Type:      EventSessionClosed,
				SessionID: sessionID,
			})

			delete(activeSessions, sessionID)
		}
		sessionsMu.Unlock()
	}
}

// startSandboxedCommand runs one COMMAND event in its session's sandbox,
// tracked by sbSessions so the container is removed once the session idles.
func startSandboxedCommand(ctx context.Context, handler *grpcclient.RemoteExecuteHandler, resp *pb.RemoteExecuteSubscribeResponse, sbSessions *sandboxSessions, cmdSandbox agentCommandSandbox, remoteSem chan struct{}, events chan<- TuiEvent, toolPath string) {
	log := NewTuiLogger(events, "RemoteExec")
	sessionID, command := resp.SessionId, resp.Command
	// Captured now: Next() overwrites handler ids before the goroutine sends
	cmdID, cmdWorkerID := resp.Id, resp.WorkerId

	ok, isNew := sbSessions.begin(sessionID)
	if !ok {
		log.Warning("agent sandbox limit reached (%d live)", maxLiveSandboxes)
		_ = handler.SendErrorFor(ctx, sessionID, cmdID, cmdWorkerID, "too many active agent sandboxes on this worker, try again shortly")
		return
	}
	if isNew {
		log.Info("Session sandbox: %s -> isolated container", sessionID)
		Emit(events, TuiEvent{Type: EventSessionCreated, SessionID: sessionID, SessionActive: true})
	}
	Emit(events, TuiEvent{Type: EventSessionCommand, SessionID: sessionID, SessionCommand: command})

	sb := &sessionSandbox{sessionID: sessionID, container: cmdSandbox}
	select {
	case remoteSem <- struct{}{}:
		go func() {
			defer func() { <-remoteSem }()
			defer sbSessions.end(sessionID)
			executeRemoteCommand(ctx, handler, sessionID, cmdID, cmdWorkerID, command, sb, nil, events, toolPath)
		}()
	default:
		sbSessions.end(sessionID)
		log.Warning("remote exec concurrency limit reached")
		_ = handler.SendErrorFor(ctx, sessionID, cmdID, cmdWorkerID, "server busy")
	}
}

func executeRemoteCommand(ctx context.Context, handler remoteResultSender, sessionID, cmdID, workerID, command string, sandbox *sessionSandbox, browsers *agentBrowsers, events chan<- TuiEvent, toolPath string) {
	log := NewTuiLogger(events, "RemoteExec")
	log.Info("Executing in session %s: %s", sessionID, command)
	_ = cmdID
	_ = workerID

	// Recognised before any shell wrapping, like the "screenshot " job.
	if rest, ok := strings.CutPrefix(command, "browser "); ok || command == "browser" {
		executeBrowserCommand(ctx, handler, sessionID, rest, sandbox, browsers, events)
		return
	}

	if sandbox.container != nil {
		executeSandboxedCommand(ctx, handler, sessionID, command, sandbox.container, events)
		return
	}

	wrappedCmd := fmt.Sprintf("(%s) 2>&1", command)
	cmd := exec.CommandContext(ctx, "sh", "-c", wrappedCmd)
	cmd.Dir = sandbox.rootPath
	cmd.SysProcAttr = newSysProcAttr()
	cmd.Env = setupCmdEnv(toolPath)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		log.ErrorE("Failed to create stdout pipe", err)
		_ = handler.SendError(ctx, fmt.Sprintf("stdout pipe failed: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		log.ErrorE("Failed to start command", err)
		_ = handler.SendError(ctx, fmt.Sprintf("command start failed: %v", err))
		return
	}

	buf := make([]byte, 32*1024)
	for {
		n, readErr := stdoutPipe.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			if sendErr := handler.SendStdout(ctx, chunk); sendErr != nil {
				log.ErrorE("Failed to stream output", sendErr)
				return
			}
			Emit(events, TuiEvent{
				Type:          EventSessionOutput,
				SessionID:     sessionID,
				SessionOutput: string(chunk),
				SessionStream: "stdout",
			})
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			log.ErrorE("Error reading from pipe", readErr)
			break
		}
	}

	exitCode := int32(0)
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = int32(exitErr.ExitCode())
			log.Warning("Command failed (code %d): %s", exitCode, command)
		} else {
			log.ErrorE(fmt.Sprintf("Command failed: %s", command), err)
			_ = handler.SendError(ctx, fmt.Sprintf("command execution failed: %v", err))
			_ = handler.SendExit(ctx, 1)
			return
		}
	} else {
		log.Success("Command completed: %s", command)
	}

	_ = handler.SendExit(ctx, exitCode)
}

// executeBrowserCommand runs a "browser ..." command in the worker's agent
// Chromium and reports it like a shell command: stdout, then EXIT 0 or 1.
// Refused on a sandboxed worker: the browser runs in this process, outside
// the per-session container, and core routes other workspaces' agents only
// to sandboxed (global) workers.
func executeBrowserCommand(ctx context.Context, handler remoteResultSender, sessionID, line string, sandbox *sessionSandbox, browsers *agentBrowsers, events chan<- TuiEvent) {
	if sandbox.container != nil {
		_ = handler.SendError(ctx, "browser commands are not available on a sandboxed worker")
		return
	}
	if browsers == nil {
		_ = handler.SendError(ctx, "browser is not available on this worker")
		return
	}
	out, failed, err := browsers.run(ctx, line)
	if err != nil {
		NewTuiLogger(events, "RemoteExec").ErrorE("Browser unavailable", err)
		_ = handler.SendError(ctx, err.Error())
		return
	}
	if !strings.HasSuffix(out, "\n") {
		out += "\n"
	}
	if err := handler.SendStdout(ctx, []byte(out)); err != nil {
		return
	}
	Emit(events, TuiEvent{Type: EventSessionOutput, SessionID: sessionID, SessionOutput: out, SessionStream: "stdout"})
	exitCode := int32(0)
	if failed {
		exitCode = 1
	}
	_ = handler.SendExit(ctx, exitCode)
}

// executeSandboxedCommand runs one agent command in the session's sandbox
// container and reports it through the same result path as the host exec:
// stdout chunks, then EXIT with the real exit code. Any sandbox failure
// (engine down, create/exec error, cancellation) is an ERROR result — never a
// retry on the host.
func executeSandboxedCommand(ctx context.Context, handler remoteResultSender, sessionID, command string, sb agentCommandSandbox, events chan<- TuiEvent) {
	log := NewTuiLogger(events, "RemoteExec")

	// On timeout the sandbox removes the session container, which stops the
	// command; the session's next command gets a fresh one
	cmdCtx, cancel := context.WithTimeout(ctx, sandboxCommandTimeout)
	defer cancel()
	exitCode, err := sb.Exec(cmdCtx, sessionID, command, func(chunk []byte) error {
		if sendErr := handler.SendStdout(ctx, chunk); sendErr != nil {
			return fmt.Errorf("stream output: %w", sendErr)
		}
		Emit(events, TuiEvent{
			Type:          EventSessionOutput,
			SessionID:     sessionID,
			SessionOutput: string(chunk),
			SessionStream: "stdout",
		})
		return nil
	})
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) && ctx.Err() == nil {
			err = fmt.Errorf("timed out after %s", sandboxCommandTimeout)
		}
		log.ErrorE(fmt.Sprintf("Sandboxed command failed: %s", command), err)
		_ = handler.SendError(ctx, fmt.Sprintf("sandboxed command failed: %v", err))
		return
	}

	if exitCode != 0 {
		log.Warning("Command failed (code %d): %s", exitCode, command)
	} else {
		log.Success("Command completed: %s", command)
	}
	_ = handler.SendExit(ctx, int32(exitCode))
}
