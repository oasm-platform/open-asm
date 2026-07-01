package worker

import (
	"context"
	"sync"

	"github.com/oasm-platform/oasm-sdk-go/oasm"
)

var poolLog = oasm.NewLogger("Worker.BrowserPool")

// BrowserPool manages a single shared browser session with tab isolation.
// All screenshot operations are serialized via mutex since agent-browser
// commands are not safe for concurrent use within the same session.
type BrowserPool struct {
	session *BrowserSession
	mu      sync.Mutex
}

// NewBrowserPool creates a pool backed by one persistent Chrome process.
func NewBrowserPool(toolPath string) *BrowserPool {
	return &BrowserPool{
		session: NewBrowserSession(toolPath),
	}
}

// Init ensures Chrome is installed for the shared session.
func (p *BrowserPool) Init() error {
	return p.session.ensureAgentBrowserChrome()
}

// TakeScreenshot acquires the pool, opens a new tab, captures the screenshot,
// and closes the tab. The Chrome process stays alive for the next job.
func (p *BrowserPool) TakeScreenshot(ctx context.Context, url string, opts ScreenshotOpts) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	poolLog.Debug("Acquired pool, opening tab for: %s", url)

	if err := p.session.run(ctx, "tab", "new"); err != nil {
		return "", err
	}

	base64Image, err := p.session.TakeScreenshot(ctx, url, opts)

	_ = p.session.run(context.Background(), "tab", "close")

	return base64Image, err
}

// Close shuts down the shared Chrome process.
func (p *BrowserPool) Close() error {
	return p.session.Close()
}
