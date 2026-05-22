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
	return &sessionSandbox{rootPath: sessionDir}, nil
}

func (s *sessionSandbox) chroot() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.Chdir(s.rootPath)
}

func (s *sessionSandbox) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.rootPath)
}

func startRemoteExecuteHandler(ctx context.Context, client *oasm.Client, workspaceRoot string, toolPath string) {
	log := oasm.NewLogger("RemoteExec")

	originalWd, err := os.Getwd()
	if err != nil {
		log.ErrorE("Failed to get initial working directory", err)
		return
	}

	log.Info("Subscribing to remote execute stream immediately...")
	handler, err := client.RemoteExecuteSubscribe(ctx)
	if err != nil {
		log.ErrorE("Immediate subscription failed. Waiting for next reconnect event.", err)
		return
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

	defer func() {
		_ = os.Chdir(originalWd)
		sessionsMu.Lock()
		for sessionID, sb := range activeSessions {
			if sb != nil {
				_ = sb.close()
			}
			delete(activeSessions, sessionID)
		}
		sessionsMu.Unlock()
	}()

	for {
		select {
		case <-ctx.Done():
			log.Info("Remote execute handler shutting down...")
			return
		default:
		}

		resp, err := handler.Next(ctx)
		if err != nil {
			log.ErrorE("Failed to receive remote execute event, stream broken.", err)
			return
		}
		if resp == nil {
			log.Info("Remote execute stream closed by core.")
			return
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
}

func executeRemoteCommand(ctx context.Context, handler *oasm.RemoteExecuteHandler, sessionID string, command string, sandbox *sessionSandbox, log *oasm.LoggerType, toolPath string) {
	log.Info("Executing command in session %s: %s", sessionID, command)

	if err := sandbox.chroot(); err != nil {
		log.ErrorE("Failed to change to session directory", err)
		_ = handler.SendError(ctx, fmt.Sprintf("failed to enter session workspace: %v", err))
		return
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}

	cmd.SysProcAttr = newSysProcAttr()
	cmd.Env = append(os.Environ(), fmt.Sprintf("PATH=%s%c%s", toolPath, os.PathListSeparator, os.Getenv("PATH")))

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		log.ErrorE("Failed to create stdout pipe", err)
		_ = handler.SendError(ctx, fmt.Sprintf("stdout pipe failed: %v", err))
		return
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		log.ErrorE("Failed to create stderr pipe", err)
		_ = handler.SendError(ctx, fmt.Sprintf("stderr pipe failed: %v", err))
		return
	}

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
