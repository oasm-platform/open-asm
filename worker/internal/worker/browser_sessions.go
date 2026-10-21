package worker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/go-rod/stealth"
)

const (
	// browserIdleTTL is how long an agent browser session outlives its last
	// command. Agents think between steps, so this is much longer than
	// sandboxIdleTTL.
	browserIdleTTL = 10 * time.Minute
	// maxBrowserSessions caps live sessions (one incognito context each).
	maxBrowserSessions = 8
	// browserCmdTimeout bounds one browser command; core waits 60s.
	browserCmdTimeout = 30 * time.Second
	// browserLogCap is how many lines each session log keeps.
	browserLogCap = 200
)

// ringLog keeps the last browserLogCap lines; written from CDP event
// goroutines while commands read it.
type ringLog struct {
	mu    sync.Mutex
	lines []string
}

func (r *ringLog) add(line string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.lines) >= browserLogCap {
		r.lines = r.lines[1:]
	}
	r.lines = append(r.lines, line)
}

func (r *ringLog) list(filter string) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]string, 0, len(r.lines))
	for _, l := range r.lines {
		if filter == "" || strings.Contains(l, filter) {
			out = append(out, l)
		}
	}
	return out
}

func (r *ringLog) clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lines = nil
}

// browserSession is one agent's browser: an incognito context whose traffic
// goes through its own scopeProxy. mu serialises the session's commands;
// stateMu guards what CDP event goroutines also touch.
type browserSession struct {
	id     string
	mu     sync.Mutex
	ctx    *rod.Browser
	proxy  *scopeProxy
	cancel context.CancelFunc // stops the session's event listeners
	closed atomic.Bool        // written under mu; list reads it without

	// refs maps "eN" from the last snapshot to DOM nodes of refsPage.
	refs     map[string]proto.DOMBackendNodeID
	refsPage *rod.Page

	stateMu      sync.Mutex
	pages        []*rod.Page
	active       int
	frame        *rod.Page // non-nil while inside an iframe of the active tab
	dialogAccept bool
	dialogText   string
	blocked      []string          // proxy refusals since the last command
	headers      map[string]string // extra request headers for every tab; replaced, never mutated

	console, errs, requests ringLog
}

// page is the page commands act on: the selected iframe, else the active tab.
func (s *browserSession) page() (*rod.Page, error) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if s.frame != nil {
		return s.frame, nil
	}
	if s.active >= len(s.pages) {
		return nil, errors.New("no open tab; use \"tab new <url>\"")
	}
	return s.pages[s.active], nil
}

// adopt starts tracking a page of this session (ours or a popup) and its
// events. Idempotent per target.
func (s *browserSession) adopt(p *rod.Page, ctx context.Context) {
	s.stateMu.Lock()
	for _, existing := range s.pages {
		if existing.TargetID == p.TargetID {
			s.stateMu.Unlock()
			return
		}
	}
	s.pages = append(s.pages, p)
	headers := s.headers
	s.stateMu.Unlock()
	// shortcut: a popup's first request can leave before this lands; later ones
	// carry the headers. Fixing that needs auto-attach with waitForDebuggerOnStart.
	if len(headers) > 0 {
		_ = applyHeadersTo(p, headers)
	}

	go p.Context(ctx).EachEvent(
		func(e *proto.PageJavascriptDialogOpening) {
			s.stateMu.Lock()
			accept, text := s.dialogAccept, s.dialogText
			s.stateMu.Unlock()
			// Answer every dialog at once: an open one blocks the page's JS
			// and with it every later command.
			if e.Type == proto.PageDialogTypeAlert {
				accept = true
			}
			_ = proto.PageHandleJavaScriptDialog{Accept: accept, PromptText: text}.Call(p)
			verb := "dismissed"
			if accept {
				verb = "accepted"
			}
			s.console.add(fmt.Sprintf("[dialog %s %s] %s", e.Type, verb, e.Message))
		},
		func(e *proto.RuntimeConsoleAPICalled) {
			parts := make([]string, 0, len(e.Args))
			for _, a := range e.Args {
				parts = append(parts, remoteObjectString(a))
			}
			s.console.add(fmt.Sprintf("[%s] %s", e.Type, strings.Join(parts, " ")))
		},
		func(e *proto.RuntimeExceptionThrown) {
			msg := e.ExceptionDetails.Text
			if e.ExceptionDetails.Exception != nil && e.ExceptionDetails.Exception.Description != "" {
				msg = e.ExceptionDetails.Exception.Description
			}
			s.errs.add(msg)
		},
		func(e *proto.NetworkRequestWillBeSent) {
			s.requests.add(e.Request.Method + " " + e.Request.URL)
		},
		func(e *proto.NetworkResponseReceived) {
			s.requests.add(fmt.Sprintf("  <- %d %s", e.Response.Status, e.Response.URL))
		},
		func(e *proto.NetworkLoadingFailed) {
			s.requests.add(fmt.Sprintf("  <- FAILED %s", e.ErrorText))
		},
	)()
}

func (s *browserSession) recordBlocked(line string) {
	s.requests.add(line)
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if len(s.blocked) < 20 {
		s.blocked = append(s.blocked, line)
	}
}

// drainBlocked returns and clears the refusals since the last call.
func (s *browserSession) drainBlocked() []string {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	b := s.blocked
	s.blocked = nil
	return b
}

// forget drops a page that closed (tab close, window.close()).
func (s *browserSession) forget(id proto.TargetTargetID) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	for i, p := range s.pages {
		if p.TargetID != id {
			continue
		}
		s.pages = append(s.pages[:i], s.pages[i+1:]...)
		if i == s.active {
			s.frame = nil // it belonged to the closed tab
		}
		// Keep the same tab active when an earlier one closes.
		if i < s.active || (s.active >= len(s.pages) && s.active > 0) {
			s.active--
		}
		return
	}
}

// newTab opens a tab in the session (stealth like the screenshot job) and
// makes it active.
func (s *browserSession) newTab(ctx context.Context) (*rod.Page, error) {
	p, err := stealth.Page(s.ctx)
	if err != nil {
		return nil, err
	}
	_ = p.SetViewport(&proto.EmulationSetDeviceMetricsOverride{Width: 1920, Height: 1080, DeviceScaleFactor: 1})
	_ = p.SetUserAgent(&proto.NetworkSetUserAgentOverride{UserAgent: getRandomUserAgent(), AcceptLanguage: "en-US,en;q=0.9"})
	s.adopt(p, ctx)
	s.stateMu.Lock()
	for i, q := range s.pages {
		if q.TargetID == p.TargetID {
			s.active = i
		}
	}
	s.frame = nil
	s.stateMu.Unlock()
	return p, nil
}

func (s *browserSession) shutdown() {
	s.closed.Store(true)
	s.cancel()
	_ = s.ctx.Close()
	s.proxy.close()
}

// agentBrowsers owns the agent Chromium (separate from the screenshot job's)
// and the live sessions. Sessions are keyed by an id the agent passes in each
// command, because core mints a new remote-exec session per command.
type agentBrowsers struct {
	log    *TuiLogger
	launch func() (*rod.Browser, func(), error)
	life   *sandboxSessions

	mu       sync.Mutex
	browser  *rod.Browser
	stop     func()
	sessions map[string]*browserSession
}

func newAgentBrowsers(log *TuiLogger, launch func() (*rod.Browser, func(), error)) *agentBrowsers {
	a := &agentBrowsers{log: log, launch: launch, sessions: make(map[string]*browserSession)}
	a.life = newSandboxSessions(browserIdleTTL, maxBrowserSessions, a.release)
	return a
}

func newBrowserSessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return "b-" + hex.EncodeToString(b)
}

func errBrowserSessionNotFound(id string) error {
	if !strings.HasPrefix(id, "b-") {
		return fmt.Errorf("%q is not a browser session id; pass the b-<id> from the \"session:\" line that \"browser open <url>\" printed", id)
	}
	return fmt.Errorf("browser session %s not found (expired or worker restarted); run \"browser open <url>\" again", id)
}

// ensureBrowser launches Chromium on first use and relaunches it if it died.
// Caller holds a.mu.
func (a *agentBrowsers) ensureBrowser() error {
	if a.browser != nil {
		if _, err := (proto.BrowserGetVersion{}).Call(a.browser); err == nil {
			return nil
		}
		a.stopBrowser()
		// Its sessions died with it: free their slots now, not at the idle TTL.
		for id, s := range a.sessions {
			s.cancel()
			s.proxy.close()
			delete(a.sessions, id)
			a.life.remove(id)
		}
	}
	if a.launch == nil {
		return errBrowserUnavailable
	}
	b, stop, err := a.launch()
	if err != nil {
		return fmt.Errorf("%w: %w", errBrowserUnavailable, err)
	}
	a.browser, a.stop = b, stop
	return nil
}

func (a *agentBrowsers) stopBrowser() {
	if a.stop != nil {
		a.stop()
	}
	a.browser, a.stop = nil, nil
}

// open creates a session scoped to allow and returns it locked; done unlocks
// it and starts its idle timer.
func (a *agentBrowsers) open(allow []string) (*browserSession, func(), error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.ensureBrowser(); err != nil {
		return nil, nil, err
	}
	id := newBrowserSessionID()
	if ok, _ := a.life.begin(id); !ok {
		return nil, nil, fmt.Errorf("too many browser sessions on this worker (%d); close one with \"browser -s <id> close\"", maxBrowserSessions)
	}
	s := &browserSession{id: id}
	proxy, err := newScopeProxy(allow, s.recordBlocked)
	if err != nil {
		a.life.end(id)
		return nil, nil, err
	}
	// "<-loopback>" sends localhost through the proxy too, so it is in scope
	// only when allowed like any other host.
	res, err := proto.TargetCreateBrowserContext{ProxyServer: "http://" + proxy.addr(), ProxyBypassList: "<-loopback>"}.Call(a.browser)
	if err != nil {
		proxy.close()
		a.life.end(id)
		return nil, nil, err
	}
	ctxBrowser := *a.browser
	ctxBrowser.BrowserContextID = res.BrowserContextID
	evCtx, cancel := context.WithCancel(context.Background())
	s.ctx, s.proxy, s.cancel = &ctxBrowser, proxy, cancel
	a.watchTargets(s, evCtx)
	a.sessions[id] = s
	s.mu.Lock()
	return s, a.doneFunc(s), nil
}

// watchTargets adopts popups the session's pages open and forgets closed ones.
func (a *agentBrowsers) watchTargets(s *browserSession, ctx context.Context) {
	_ = proto.TargetSetDiscoverTargets{Discover: true}.Call(a.browser)
	go a.browser.Context(ctx).EachEvent(
		func(e *proto.TargetTargetCreated) {
			if e.TargetInfo.BrowserContextID != s.ctx.BrowserContextID || e.TargetInfo.Type != proto.TargetTargetInfoTypePage {
				return
			}
			if p, err := s.ctx.PageFromTarget(e.TargetInfo.TargetID); err == nil {
				s.adopt(p, ctx)
			}
		},
		func(e *proto.TargetTargetDestroyed) { s.forget(e.TargetID) },
	)()
}

// acquire returns an existing session locked for one command.
func (a *agentBrowsers) acquire(id string) (*browserSession, func(), error) {
	a.mu.Lock()
	s, ok := a.sessions[id]
	if ok {
		if _, isNew := a.life.begin(id); isNew {
			// Expired between lookup and begin; let the new entry lapse.
			a.life.end(id)
			ok = false
		}
	}
	a.mu.Unlock()
	if !ok {
		return nil, nil, errBrowserSessionNotFound(id)
	}
	s.mu.Lock()
	if s.closed.Load() {
		s.mu.Unlock()
		a.life.end(id)
		return nil, nil, errBrowserSessionNotFound(id)
	}
	return s, a.doneFunc(s), nil
}

func (a *agentBrowsers) doneFunc(s *browserSession) func() {
	return func() {
		closed := s.closed.Load()
		s.mu.Unlock()
		if !closed {
			a.life.end(s.id)
			return
		}
		// Closed by its own "close" command: free the slot now, not after the idle TTL.
		a.mu.Lock()
		delete(a.sessions, s.id)
		a.mu.Unlock()
		a.life.remove(s.id)
	}
}

// release is the idle-TTL callback; also safe for already closed sessions.
func (a *agentBrowsers) release(id string) {
	a.mu.Lock()
	s := a.sessions[id]
	delete(a.sessions, id)
	a.mu.Unlock()
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed.Load() {
		s.shutdown()
	}
}

// list returns the live session ids.
func (a *agentBrowsers) list() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	ids := make([]string, 0, len(a.sessions))
	for id, s := range a.sessions {
		if !s.closed.Load() {
			ids = append(ids, id)
		}
	}
	return ids
}

// shutdown closes every session and the agent Chromium (worker exit).
func (a *agentBrowsers) shutdown() {
	a.life.closeAll()
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stopBrowser()
}

func remoteObjectString(o *proto.RuntimeRemoteObject) string {
	if o == nil {
		return ""
	}
	if !o.Value.Nil() {
		if o.Type == proto.RuntimeRemoteObjectTypeString {
			return o.Value.Str()
		}
		return o.Value.JSON("", "")
	}
	if o.Description != "" {
		return o.Description
	}
	return string(o.Type)
}
