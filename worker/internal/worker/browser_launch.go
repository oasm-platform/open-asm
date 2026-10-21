package worker

import (
	"fmt"
	"os"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

// launchBrowser starts a headless Chromium (system binary when present, else
// go-rod's download) and connects to it. Each caller gets its own process, so
// one browser hanging cannot stall another's work. configure adjusts the
// launcher before the launch.
func launchBrowser(log *TuiLogger, configure ...func(*launcher.Launcher)) (*rod.Browser, *launcher.Launcher, error) {
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
	for _, f := range configure {
		f(l)
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

// agentBrowserFlags hardens the Chromium agents drive, which loads pages from
// any site: it gets none of the worker's environment (API key, tokens). On a
// shared worker WebRTC may not send UDP around the sessions' publicProxy.
func agentBrowserFlags(shared bool) func(*launcher.Launcher) {
	return func(l *launcher.Launcher) {
		if shared {
			l.Set("force-webrtc-ip-handling-policy", "disable_non_proxied_udp")
		}
		l.Env(browserEnv()...)
	}
}

// browserEnvKeys are the variables Chromium needs to start and render, on
// Linux and on a Windows host worker.
var browserEnvKeys = []string{
	"PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ",
	"XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "FONTCONFIG_PATH",
	"SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA",
	"PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA",
}

// browserEnv returns the worker's values of browserEnvKeys only.
func browserEnv() []string {
	var env []string
	for _, k := range browserEnvKeys {
		if v, ok := os.LookupEnv(k); ok {
			env = append(env, k+"="+v)
		}
	}
	return env
}
