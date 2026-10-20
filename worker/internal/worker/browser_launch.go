package worker

import (
	"fmt"
	"os"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

// launchBrowser starts a headless Chromium (system binary when present, else
// go-rod's download) and connects to it. Each caller gets its own process, so
// one browser hanging cannot stall another's work.
func launchBrowser(log *TuiLogger) (*rod.Browser, *launcher.Launcher, error) {
	l := launcher.New().Leakless(false).Headless(true)
	found := false
	for _, bin := range []string{"/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"} {
		if _, err := os.Stat(bin); err == nil {
			log.Verbose("Using system chromium at %s", bin)
			l = l.Bin(bin)
			found = true
			break
		}
	}
	if !found {
		log.Verbose("No system chromium found, go-rod will download Chrome automatically")
	}
	url, err := l.Launch()
	if err != nil {
		return nil, nil, fmt.Errorf("browser launch failed: %w", err)
	}
	b := rod.New().ControlURL(url)
	if err := b.Connect(); err != nil {
		// Best-effort cleanup on connect failure
		l.Kill()
		l.Cleanup()
		return nil, nil, fmt.Errorf("browser connect failed: %w", err)
	}
	return b, l, nil
}
