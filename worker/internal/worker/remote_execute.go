package worker

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/oasm-platform/oasm-sdk-go/oasm"
	pb "github.com/oasm-platform/open-asm/grpc-client/go/workers"
)

type sessionSandbox struct {
	rootPath string
	mu       sync.Mutex
}

func newSessionSandbox(workspaceRoot, sessionID string) (*sessionSandbox, error) {
	sessionDir := filepath.Join(workspaceRoot, sessionID)

	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create session directory: %w", err)
	}

	return &sessionSandbox{
		rootPath: sessionDir,
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
	return os.RemoveAll(s.rootPath)
}

func startRemoteExecuteHandler(ctx context.Context, client *oasm.Client, workspaceRoot string, toolPath string) {
	log := oasm.NewLogger("RemoteExec")

	for {
		select {
		case <-ctx.Done():
			log.Info("Remote execute handler shutting down...")
			return
		default:
		}

		log.Info("Subscribing to remote execute stream...")

		handler, err := client.RemoteExecuteSubscribe(ctx)
		if err != nil {
			log.ErrorE("Failed to subscribe to remote execute, retrying in 5s...", err)

			timer := time.NewTimer(5 * time.Second)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
				continue
			}
		}

		log.Success("Connected to remote execute stream (worker: %s)", client.WorkerID())

		activeSessions := make(map[string]*sessionSandbox)
		var sessionsMu sync.Mutex

		getOrCreateSandbox := func(sessionID string) (*sessionSandbox, error) {
			sessionsMu.Lock()
			defer sessionsMu.Unlock()

			if sb, ok := activeSessions[sessionID]; ok {
				return sb, nil
			}

			sb, err := newSessionSandbox(workspaceRoot, sessionID)
			if err != nil {
				return nil, err
			}

			activeSessions[sessionID] = sb
			log.Info("Created session sandbox: %s -> %s", sessionID, sb.rootPath)
			return sb, nil
		}

		for {
			resp, err := handler.Next(ctx)
			if err != nil {
				log.ErrorE("Failed to receive remote execute event, reconnecting...", err)
				break
			}

			if resp == nil {
				log.Info("Remote execute stream closed, reconnecting...")
				break
			}

			switch resp.Type {
			case pb.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTED:
				log.Success("Session connected: %s (id: %s)", resp.SessionId, resp.Id)

			case pb.RemoteExecuteSubscribeEventType_REMOTE_EXECUTE_SUBSCRIBE_EVENT_COMMAND:
				sessionID := resp.SessionId
				command := resp.Command

				if sessionID == "" || command == "" {
					log.Warning("Received command with empty session or command field")
					_ = handler.SendError(ctx, "empty session or command")
					continue
				}

				sb, err := getOrCreateSandbox(sessionID)
				if err != nil {
					log.ErrorE("Failed to create session sandbox", err)
					_ = handler.SendError(ctx, fmt.Sprintf("failed to create session workspace: %v", err))
					continue
				}

				go executeRemoteCommand(ctx, handler, sessionID, command, sb, log, toolPath)

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
			delete(activeSessions, sessionID)
		}
		sessionsMu.Unlock()
	}
}

func executeRemoteCommand(ctx context.Context, handler *oasm.RemoteExecuteHandler, sessionID string, command string, sandbox *sessionSandbox, log *oasm.LoggerType, toolPath string) {
	log.Info("Executing command in session %s: %s", sessionID, command)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}

	cmd.Dir = sandbox.rootPath
	cmd.SysProcAttr = newSysProcAttr()
	cmd.Env = setupCmdEnv(toolPath)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		log.ErrorE("Failed to create stdout pipe", err)
		_ = handler.SendError(ctx, fmt.Sprintf("stdout pipe failed: %v", err))
		return
	}
	defer stdoutPipe.Close()

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		log.ErrorE("Failed to create stderr pipe", err)
		_ = handler.SendError(ctx, fmt.Sprintf("stderr pipe failed: %v", err))
		return
	}
	defer stderrPipe.Close()

	if err := cmd.Start(); err != nil {
		log.ErrorE("Failed to start command", err)
		_ = handler.SendError(ctx, fmt.Sprintf("command start failed: %v", err))
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		streamPipe(ctx, stdoutPipe, handler.SendStdout, log)
	}()

	go func() {
		defer wg.Done()
		streamPipe(ctx, stderrPipe, handler.SendStderr, log)
	}()

	wg.Wait()

	exitCode := int32(0)
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = int32(exitErr.ExitCode())
		} else {
			log.ErrorE("Command wait failed", err)
			_ = handler.SendError(ctx, fmt.Sprintf("command execution failed: %v", err))
			_ = handler.SendExit(ctx, 1)
			return
		}
	}

	log.Info("Command completed with exit code %d", exitCode)
	if err := handler.SendExit(ctx, exitCode); err != nil {
		log.ErrorE("Failed to send exit code", err)
	}
}

func streamPipe(ctx context.Context, pipe io.ReadCloser, sendFunc func(context.Context, []byte) error, log *oasm.LoggerType) {
	buf := make([]byte, 32*1024)
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		n, err := pipe.Read(buf)
		if n > 0 {
			data := make([]byte, n)
			copy(data, buf[:n])
			if sendErr := sendFunc(ctx, data); sendErr != nil {
				log.ErrorE("Failed to stream output", sendErr)
				return
			}
		}
		if err != nil {
			if err != io.EOF {
				log.ErrorE("Pipe read error", err)
			}
			return
		}
	}
}
