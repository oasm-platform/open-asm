package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/oasm-platform/oasm-sdk-go/oasm"
)

var browserLog = oasm.NewLogger("Worker.Browser")

// BrowserSession manages agent-browser CLI sessions
type BrowserSession struct {
	sessionID string
	toolPath  string
}

// ScreenshotResult represents output from agent-browser screenshot --json
type ScreenshotResult struct {
	Success bool `json:"success"`
	Data    struct {
		Path        string `json:"path"`
		Annotations []any  `json:"annotations"`
	} `json:"data"`
}

// ScreenshotOpts configures screenshot capture
type ScreenshotOpts struct {
	Width     int
	Height    int
	UserAgent string
	Headers   map[string]string
	Quality   int
}

// NewBrowserSession creates a new agent-browser session
func NewBrowserSession(sessionID, toolPath string) *BrowserSession {
	return &BrowserSession{
		sessionID: sessionID,
		toolPath:  toolPath,
	}
}

// ensureAgentBrowserChrome installs Chrome via agent-browser if not already installed
func (b *BrowserSession) ensureAgentBrowserChrome() error {
	browserLog.Info("Checking agent-browser Chrome installation...")

	// Try to run agent-browser to check if it works
	if err := b.run(context.Background(), "--version"); err != nil {
		return fmt.Errorf("agent-browser binary not found or not working: %w", err)
	}

	// Install Chrome
	browserLog.Info("Installing Chrome via agent-browser...")
	if err := b.run(context.Background(), "install"); err != nil {
		return fmt.Errorf("agent-browser install failed: %w", err)
	}

	browserLog.Success("Chrome installed successfully")
	return nil
}

// TakeScreenshot captures a screenshot via agent-browser CLI
func (b *BrowserSession) TakeScreenshot(ctx context.Context, url string, opts ScreenshotOpts) (string, error) {
	// Set viewport
	if err := b.run(ctx, "set", "viewport",
		fmt.Sprintf("%d", opts.Width),
		fmt.Sprintf("%d", opts.Height)); err != nil {
		return "", fmt.Errorf("set viewport: %w", err)
	}

	// Set headers (including User-Agent)
	headers := make(map[string]string)
	for k, v := range opts.Headers {
		headers[k] = v
	}
	if opts.UserAgent != "" {
		headers["User-Agent"] = opts.UserAgent
	}
	headersJSON, _ := json.Marshal(headers)
	if err := b.run(ctx, "set", "headers", string(headersJSON)); err != nil {
		return "", fmt.Errorf("set headers: %w", err)
	}

	// Open URL
	if err := b.run(ctx, "open", url); err != nil {
		return "", fmt.Errorf("open url: %w", err)
	}

	// Wait for all resources (CSS, JS, images) to load
	waitCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := b.run(waitCtx, "wait", "--load", "load"); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("timeout loading page %s", url)
		}
		return "", fmt.Errorf("wait load: %w", err)
	}

	// Wait for network idle (no pending requests)
	idleCtx, idleCancel := context.WithTimeout(ctx, 15*time.Second)
	defer idleCancel()
	_ = b.run(idleCtx, "wait", "--load", "networkidle")

	// Screenshot with --json to get file path
	output, err := b.runOutput(ctx, "screenshot", "--json", "-")
	if err != nil {
		return "", fmt.Errorf("screenshot: %w", err)
	}

	var result ScreenshotResult
	if err := json.Unmarshal([]byte(output), &result); err != nil {
		return "", fmt.Errorf("parse screenshot output: %w", err)
	}

	if result.Data.Path == "" {
		return "", fmt.Errorf("screenshot: no path in output")
	}

	imgBytes, err := os.ReadFile(result.Data.Path)
	if err != nil {
		return "", fmt.Errorf("read screenshot file: %w", err)
	}
	_ = os.Remove(result.Data.Path)

	return base64.StdEncoding.EncodeToString(imgBytes), nil
}

// Close closes the browser session
func (b *BrowserSession) Close() error {
	return b.run(context.Background(), "close")
}

// run executes an agent-browser command with retry on transient errors
func (b *BrowserSession) run(ctx context.Context, args ...string) error {
	binaryPath := getAgentBrowserPath(b.toolPath)
	fullArgs := append([]string{"--session", b.sessionID}, args...)
	const maxRetries = 3
	for attempt := range maxRetries {
		cmd := exec.CommandContext(ctx, binaryPath, fullArgs...)
		output, err := cmd.CombinedOutput()
		if err == nil {
			return nil
		}
		out := string(output)
		if attempt < maxRetries-1 && isTransientError(out) {
			time.Sleep(time.Duration(attempt+1) * 500 * time.Millisecond)
			continue
		}
		return fmt.Errorf("%s: %w (output: %s)", args[0], err, out)
	}
	return nil
}

// runOutput executes an agent-browser command and returns output
func (b *BrowserSession) runOutput(ctx context.Context, args ...string) (string, error) {
	binaryPath := getAgentBrowserPath(b.toolPath)
	fullArgs := append([]string{"--session", b.sessionID}, args...)
	const maxRetries = 3
	for attempt := range maxRetries {
		cmd := exec.CommandContext(ctx, binaryPath, fullArgs...)
		output, err := cmd.Output()
		if err == nil {
			return string(output), nil
		}
		out := string(output)
		if attempt < maxRetries-1 && isTransientError(out) {
			time.Sleep(time.Duration(attempt+1) * 500 * time.Millisecond)
			continue
		}
		return "", fmt.Errorf("%s: %w (output: %s)", args[0], err, out)
	}
	return "", nil
}

// isTransientError checks if the error is a transient daemon-busy error
func isTransientError(output string) bool {
	return strings.Contains(output, "Resource temporarily unavailable") ||
		strings.Contains(output, "daemon may be busy")
}

// getAgentBrowserPath returns the path to agent-browser binary in toolPath
func getAgentBrowserPath(toolPath string) string {
	return filepath.Join(toolPath, "agent-browser")
}
