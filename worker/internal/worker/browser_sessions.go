package worker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
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
	// browserHealthTimeout bounds the liveness probe of the agent Chromium: a
	// hung (not dead) browser must not hold a.mu and stall every session.
	browserHealthTimeout = 5 * time.Second
	// browserCleanupTimeout bounds closing a context or the browser.
	browserCleanupTimeout = 5 * time.Second
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

// browserSession is one agent's browser: an incognito context. On a shared
// worker its traffic goes through its own publicProxy. mu serialises the
// session's commands; stateMu guards what CDP event goroutines also touch.
type browserSession struct {
	id    string
	mu    sync.Mutex
	ctx   *rod.Browser // bound to sessCtx, so its pages are too
	proxy *publicProxy // nil unless the worker is shared
	// sessCtx lives as long as the session. Its pages, their event listeners
	// and rod's mouse and keyboard (which ignore a command's ctx) all run on
	// it, so cancel aborts every CDP call still pending in the session.
	sessCtx context.Context
	cancel  context.CancelFunc
	closed  atomic.Bool // set once the session ends; count reads it without mu

	// refs maps "eN" from the last snapshot to DOM nodes of refsPage.
	refs     map[string]proto.DOMBackendNodeID
	refsPage *rod.Page

	stateMu      sync.Mutex
	pages        []*rod.Page
	active       int
	frame        *rod.Page // non-nil while inside an iframe of the active tab
	dialogAccept bool
	dialogText   string
	blocked      []string          // publicProxy refusals since the last command
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
// events until the session ends. Idempotent per target.
func (s *browserSession) adopt(p *rod.Page) {
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

	go p.Context(s.sessCtx).EachEvent(
		func(e *proto.PageJavascriptDialogOpening) {
			s.stateMu.Lock()
			accept, text := s.dialogAccept, s.dialogText
			s.stateMu.Unlock()
			// Answer every dialog at once: an open one blocks the page's JS
			// and with it every later command. A beforeunload is always
			// accepted: leaving the page is what the command asked for.
			if e.Type == proto.PageDialogTypeAlert || e.Type == proto.PageDialogTypeBeforeunload {
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
// makes it active. The page is created on s.ctx, not ctx: it outlives this
// command.
func (s *browserSession) newTab(ctx context.Context) (*rod.Page, error) {
	p, err := stealth.Page(s.ctx)
	if err != nil {
		return nil, err
	}
	pc := p.Context(ctx)
	_ = pc.SetViewport(&proto.EmulationSetDeviceMetricsOverride{Width: 1920, Height: 1080, DeviceScaleFactor: 1})
	_ = pc.SetUserAgent(&proto.NetworkSetUserAgentOverride{UserAgent: getRandomUserAgent(), AcceptLanguage: "en-US,en;q=0.9"})
	s.adopt(p)
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

const (
	// browserShotWidth caps a screenshot's width: readable for a model, small
	// enough (~50-150 KB as JPEG) to send after every command.
	browserShotWidth = 1280
	// browserShotTimeout bounds taking a screenshot after a command.
	browserShotTimeout = 5 * time.Second
)

// screenshot returns the visible part of the active tab as JPEG, scaled down
// to browserShotWidth. Best effort: nil when the session is closed, has no
// tab, or the capture fails.
func (s *browserSession) screenshot(ctx context.Context) []byte {
	if s.closed.Load() {
		return nil
	}
	s.stateMu.Lock()
	var p *rod.Page
	if s.active < len(s.pages) {
		p = s.pages[s.active] // the whole tab, also while inside an iframe
	}
	s.stateMu.Unlock()
	if p == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, browserShotTimeout)
	defer cancel()
	p = p.Context(ctx)
	m, err := proto.PageGetLayoutMetrics{}.Call(p)
	if err != nil || m.CSSVisualViewport == nil || m.CSSVisualViewport.ClientWidth <= 0 {
		return nil
	}
	vp := m.CSSVisualViewport
	scale := 1.0
	if vp.ClientWidth > browserShotWidth {
		scale = browserShotWidth / vp.ClientWidth
	}
	quality := 70
	res, err := proto.PageCaptureScreenshot{
		Format:  proto.PageCaptureScreenshotFormatJpeg,
		Quality: &quality,
		Clip:    &proto.PageViewport{X: vp.PageX, Y: vp.PageY, Width: vp.ClientWidth, Height: vp.ClientHeight, Scale: scale},
	}.Call(p)
	if err != nil {
		return nil
	}
	return res.Data
}

// shutdown ends the session. Cancelling sessCtx first makes any command
// still running in it return, whatever its page is doing.
func (s *browserSession) shutdown() {
	s.closed.Store(true)
	s.cancel()
	ctx, cancel := context.WithTimeout(context.Background(), browserCleanupTimeout)
	defer cancel()
	_ = s.ctx.Context(ctx).Close()
	s.proxy.close()
}

// agentBrowsers owns the agent Chromium (separate from the screenshot job's)
// and the live sessions. Sessions are keyed by an id the agent passes in each
// command, because core mints a new remote-exec session per command. The id
// is the only credential for a session, so it is never listed.
type agentBrowsers struct {
	log    *TuiLogger
	launch func() (*rod.Browser, func(), error)
	life   *sandboxSessions
	// publicOnly limits every session to public addresses. Set on a sandboxed
	// worker, which may serve other workspaces: its network is the platform's.
	publicOnly bool

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

// ensureBrowser launches Chromium on first use and relaunches it if it died
// or stopped answering. Caller holds a.mu.
func (a *agentBrowsers) ensureBrowser(ctx context.Context) error {
	if a.browser != nil {
		hctx, cancel := context.WithTimeout(ctx, browserHealthTimeout)
		_, err := proto.BrowserGetVersion{}.Call(a.browser.Context(hctx))
		cancel()
		if err == nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err() // the command ran out of time, not the browser
		}
		a.stopBrowser()
		// Its sessions died with it: free their slots now, not at the idle TTL.
		for id, s := range a.sessions {
			s.closed.Store(true)
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
	if a.publicOnly {
		if err := verifyContextProxy(ctx, b); err != nil {
			stop()
			return fmt.Errorf("%w: %w", errBrowserUnavailable, err)
		}
	}
	a.browser, a.stop = b, stop
	return nil
}

// proxyCheckURL is never resolvable, so only a proxy can answer it.
const proxyCheckURL = "http://proxy-check.invalid/"

// verifyContextProxy checks that b sends an incognito context's traffic
// through the proxy the context was created with. Some builds ignore it
// (seen with go-rod's Chromium 128 on Windows); on a shared worker sessions
// there could reach local addresses, so such a browser is refused.
func verifyContextProxy(ctx context.Context, b *rod.Browser) error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	seen := make(chan struct{}, 1)
	srv := &http.Server{ReadHeaderTimeout: 5 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.String() == proxyCheckURL {
			select {
			case seen <- struct{}{}:
			default:
			}
		}
		w.Header().Set("Content-Type", "text/html")
	})}
	go func() { _ = srv.Serve(ln) }()
	defer func() { _ = srv.Close() }()

	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cb := b.Context(cctx)
	res, err := proto.TargetCreateBrowserContext{ProxyServer: "http://" + ln.Addr().String()}.Call(cb)
	if err != nil {
		return err
	}
	defer func() { _ = proto.TargetDisposeBrowserContext{BrowserContextID: res.BrowserContextID}.Call(cb) }()
	cb.BrowserContextID = res.BrowserContextID
	p, err := cb.Page(proto.TargetCreateTarget{})
	if err != nil {
		return err
	}
	_ = p.Navigate(proxyCheckURL)
	select {
	case <-seen:
		return nil
	default:
		return errors.New("this Chromium ignores per-session proxies, so this shared worker cannot keep the browser off local addresses")
	}
}

func (a *agentBrowsers) stopBrowser() {
	if a.stop != nil {
		a.stop()
	}
	a.browser, a.stop = nil, nil
}

// open creates a session and returns it locked; done unlocks it and starts
// its idle timer. ctx bounds only the setup calls.
func (a *agentBrowsers) open(ctx context.Context) (*browserSession, func(), error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.ensureBrowser(ctx); err != nil {
		return nil, nil, err
	}
	id := newBrowserSessionID()
	if ok, _ := a.life.begin(id); !ok {
		return nil, nil, fmt.Errorf("too many browser sessions on this worker (%d); close one with \"browser -s <id> close\"", maxBrowserSessions)
	}
	s := &browserSession{id: id}
	var proxy *publicProxy
	req := proto.TargetCreateBrowserContext{}
	if a.publicOnly {
		var err error
		if proxy, err = newPublicProxy(s.recordBlocked); err != nil {
			a.life.remove(id) // never existed: no idle timer holding its slot
			return nil, nil, err
		}
		// "<-loopback>" sends localhost through the proxy too, which refuses it.
		req.ProxyServer, req.ProxyBypassList = "http://"+proxy.addr(), "<-loopback>"
	}
	b := a.browser.Context(ctx)
	res, err := req.Call(b)
	if err == nil {
		// Downloads would land on the worker's disk, and agents read text only.
		err = proto.BrowserSetDownloadBehavior{Behavior: proto.BrowserSetDownloadBehaviorBehaviorDeny, BrowserContextID: res.BrowserContextID}.Call(b)
		if err != nil {
			_ = proto.TargetDisposeBrowserContext{BrowserContextID: res.BrowserContextID}.Call(b)
		}
	}
	if err != nil {
		proxy.close()
		a.life.remove(id)
		return nil, nil, err
	}
	s.sessCtx, s.cancel = context.WithCancel(context.Background())
	s.ctx = a.browser.Context(s.sessCtx)
	s.ctx.BrowserContextID = res.BrowserContextID
	s.proxy = proxy
	a.watchTargets(ctx, s)
	a.sessions[id] = s
	s.mu.Lock()
	return s, a.doneFunc(s), nil
}

// watchTargets adopts popups the session's pages open and forgets closed
// ones, until the session ends.
func (a *agentBrowsers) watchTargets(ctx context.Context, s *browserSession) {
	_ = proto.TargetSetDiscoverTargets{Discover: true}.Call(a.browser.Context(ctx))
	go a.browser.Context(s.sessCtx).EachEvent(
		func(e *proto.TargetTargetCreated) {
			if e.TargetInfo.BrowserContextID != s.ctx.BrowserContextID || e.TargetInfo.Type != proto.TargetTargetInfoTypePage {
				return
			}
			if p, err := s.ctx.PageFromTarget(e.TargetInfo.TargetID); err == nil {
				s.adopt(p)
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
			// Expired between lookup and begin: release is about to close it.
			// Drop the entry begin just made instead of idling it for the TTL.
			a.life.remove(id)
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
		a.life.remove(id)
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
		// Closed by "close" or after wedging: free the slot now, not after the idle TTL.
		a.mu.Lock()
		if a.sessions[s.id] == s {
			delete(a.sessions, s.id)
		}
		a.mu.Unlock()
		a.life.remove(s.id)
	}
}

// release is the idle-TTL and worker-shutdown callback; also safe for
// already closed sessions.
func (a *agentBrowsers) release(id string) {
	a.mu.Lock()
	s := a.sessions[id]
	delete(a.sessions, id)
	a.mu.Unlock()
	if s == nil {
		return
	}
	// At worker shutdown a command may still run: abort it rather than wait
	// for its lock.
	s.cancel()
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed.Load() {
		s.shutdown()
	}
}

// count returns how many sessions are live.
func (a *agentBrowsers) count() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := 0
	for _, s := range a.sessions {
		if !s.closed.Load() {
			n++
		}
	}
	return n
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
