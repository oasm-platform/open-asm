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

// BrowserSession manages agent-browser CLI invocations.
type BrowserSession struct {
	toolPath string
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
func NewBrowserSession(toolPath string) *BrowserSession {
	return &BrowserSession{
		toolPath: toolPath,
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

// TakeScreenshot captures a screenshot via agent-browser CLI.
// All commands batched into a single shell call.
func (b *BrowserSession) TakeScreenshot(ctx context.Context, url string, opts ScreenshotOpts) (string, error) {
	headers := make(map[string]string)
	for k, v := range opts.Headers {
		headers[k] = v
	}
	if opts.UserAgent != "" {
		headers["User-Agent"] = opts.UserAgent
	}
	headersJSON, _ := json.Marshal(headers)
	escapedHeaders := strings.ReplaceAll(string(headersJSON), "'", "'\\''")

	bin := b.binaryPath()
	batch := fmt.Sprintf(
		"%s set viewport %d %d && %s set headers '%s' && %s open %s && %s wait --load networkidle && %s screenshot --json -",
		bin, opts.Width, opts.Height,
		bin, escapedHeaders,
		bin, url,
		bin,
		bin,
	)

	waitCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	output, err := runShellOutput(waitCtx, batch)
	if err != nil {
		return "", fmt.Errorf("screenshot batch: %w", err)
	}

	var result ScreenshotResult
	jsonStr := extractJSON(output)
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
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

// runShellOutput executes a shell command and returns stdout.
func runShellOutput(ctx context.Context, cmdStr string) (string, error) {
	cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)
	output, err := cmd.Output()
	return string(output), err
}

// run executes an agent-browser command
func (b *BrowserSession) run(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, b.binaryPath(), args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %w (output: %s)", args[0], err, string(output))
	}
	return nil
}

// extractJSON finds the first { ... } JSON object in mixed stdout output.
func extractJSON(output string) string {
	if idx := strings.IndexByte(output, '{'); idx >= 0 {
		return output[idx:]
	}
	return output
}

// binaryPath returns the agent-browser binary path.
func (b *BrowserSession) binaryPath() string {
	return getAgentBrowserPath(b.toolPath)
}

// getAgentBrowserPath returns the path to agent-browser binary in toolPath
func getAgentBrowserPath(toolPath string) string {
	return filepath.Join(toolPath, "agent-browser")
}
