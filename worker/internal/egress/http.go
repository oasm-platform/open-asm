package egress

import (
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// httpProxy is the HTTP half of the egress listener: absolute-form
// forwarding for plain HTTP plus CONNECT tunnels for TLS (and any other
// TCP). Every request needs Proxy-Authorization; auth failures get 407,
// policy denials get 403. The credential never travels upstream.
//
// Forwarding is manual (request line + headers copied onto an upstream conn
// opened through srv.dial) instead of httputil.ReverseProxy: the server
// speaks raw TCP (single-port sniff), and ReverseProxy expects an
// http.Server-managed ResponseWriter our conn writer cannot provide.
type httpProxy struct {
	srv *Server
}

func newHTTPProxy(s *Server) *httpProxy { return &httpProxy{srv: s} }

func (p *httpProxy) serveConn(conn net.Conn) {
	// Single-use connection: every response carries Connection: close and
	// the socket is closed when this returns. The proxy speaks raw TCP
	// (single-port sniff) with no pipelining support, so a keep-alive
	// client reusing the socket would block forever on its second request.
	defer conn.Close()
	br := bufio.NewReader(conn)
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	req, err := http.ReadRequest(br)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
		return
	}
	rw := &connResponseWriter{conn: conn, br: br, header: http.Header{}}
	rw.Header().Set("Connection", "close")
	if req.Method == http.MethodConnect {
		p.tunnel(rw, req)
		return
	}
	if req.URL.Host == "" {
		http.Error(rw, "proxy requires an absolute URL", http.StatusBadRequest)
		return
	}
	p.forward(rw, req)
}

// proxyCredentials extracts the Basic username and password from
// Proxy-Authorization. Accepts the token in either slot: URL userinfo
// (http://token@proxy) lands in the username, some clients use password.
func proxyCredentials(r *http.Request) (user, pass string, ok bool) {
	v := r.Header.Get("Proxy-Authorization")
	if v == "" {
		return "", "", false
	}
	const prefix = "Basic "
	if len(v) <= len(prefix) || !strings.EqualFold(v[:len(prefix)], prefix) {
		return "", "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(v[len(prefix):]))
	if err != nil {
		return "", "", false
	}
	user, pass, _ = strings.Cut(string(raw), ":")
	if user == "" && pass == "" {
		return "", "", false
	}
	return user, pass, true
}

// identity is who a proxied request belongs to. runSession != "" marks a
// recorded agent remote-command run; label is for log lines and never
// carries a token.
type identity struct {
	label      string
	runSession string
	run        *runEntry
}

// lookup checks run tokens before execution tokens: a run token is random
// and short-lived, so trying it first costs nothing and keeps attribution exact.
func (p *httpProxy) lookup(token string) (identity, bool) {
	if p.srv.runs != nil {
		if e := p.srv.runs.entry(token); e != nil {
			return identity{label: "agent-session=" + e.SessionID, runSession: e.SessionID, run: e}, true
		}
	}
	if label, ok := p.srv.auth(token); ok {
		return identity{label: label}, true
	}
	return identity{}, false
}

func (p *httpProxy) authenticate(r *http.Request) (identity, bool) {
	user, pass, ok := proxyCredentials(r)
	if !ok {
		return identity{}, false
	}
	if id, ok := p.lookup(user); ok {
		return id, true
	}
	if pass != "" {
		if id, ok := p.lookup(pass); ok {
			return id, true
		}
	}
	// rawhttp (nuclei raw/unsafe templates) splits the proxy URL at "@" with
	// the scheme still on, sending base64("http://<token>"): user "http",
	// pass "//<token>".
	if (user == "http" || user == "https") && strings.HasPrefix(pass, "//") {
		if id, ok := p.lookup(pass[2:]); ok {
			return id, true
		}
	}
	return identity{}, false
}

// needAuth authenticates r; for a run token it also ties the client conn to
// the run so revoking the token cuts it. untrack must be called when the
// request is done.
func (p *httpProxy) needAuth(w *connResponseWriter, r *http.Request) (id identity, untrack func(), ok bool) {
	id, ok = p.authenticate(r)
	untrack = func() {}
	if ok && id.run != nil {
		untrack, ok = p.srv.runs.track(id.run, w.conn)
	}
	if !ok {
		w.Header().Set("Proxy-Authenticate", `Basic realm="oasm-egress"`)
		http.Error(w, "proxy authentication required", http.StatusProxyAuthRequired)
		p.srv.logWarning("egress deny method=%s target=%s reason=auth", r.Method, requestTarget(r))
		return identity{}, nil, false
	}
	return id, untrack, true
}

// holdUpstream ties the upstream conn to the run as well: closing only the
// client side would leave a tunnel's upstream->client copy blocked.
func (p *httpProxy) holdUpstream(id identity, upstream net.Conn) func() {
	if id.run == nil {
		return func() {}
	}
	untrack, ok := p.srv.runs.track(id.run, upstream)
	if !ok {
		_ = upstream.Close()
		return func() {}
	}
	return untrack
}

func requestTarget(r *http.Request) string {
	if r.Method == http.MethodConnect {
		return r.Host
	}
	if r.URL != nil && r.URL.Host != "" {
		return r.URL.Host
	}
	return r.Host
}

// eventRec is an HTTPEvent in progress; nil when the request is not
// recorded, so every method is a no-op for connector traffic.
type eventRec struct {
	HTTPEvent
	rec *Recorder
}

func (p *httpProxy) startEvent(id identity, scheme, method, host, port string, defaultPort uint32) *eventRec {
	if id.runSession == "" || p.srv.rec == nil {
		return nil
	}
	ev := &eventRec{rec: p.srv.rec}
	ev.ID = NewEventID()
	ev.SessionID = id.runSession
	if id.run != nil {
		ev.RunID = id.run.ID
	}
	// Matched by the commit in done, which every caller defers.
	ev.rec.begin(ev.RunID)
	ev.Scheme = scheme
	ev.Method = method
	ev.Host = strings.ToLower(host)
	ev.Port = defaultPort
	if n, err := strconv.ParseUint(port, 10, 16); err == nil {
		ev.Port = uint32(n)
	}
	ev.SentAt = time.Now()
	return ev
}

func (ev *eventRec) deny() {
	if ev != nil {
		ev.Outcome = OutcomeDenied
		ev.Error = "policy"
	}
}

func (ev *eventRec) fail(err error) {
	if ev != nil {
		ev.Outcome = OutcomeUpstreamError
		ev.Error = err.Error()
	}
}

func (ev *eventRec) cancel(err error) {
	if ev != nil {
		ev.Outcome = OutcomeCancelled
		ev.Error = err.Error()
	}
}

func (ev *eventRec) done() {
	if ev == nil {
		return
	}
	if ev.Outcome == 0 {
		ev.Outcome = OutcomeAllowed
	}
	ev.CompletedAt = time.Now()
	ev.Path = cut(ev.Path, maxPath)
	ev.Error = cut(ev.Error, maxError)
	ev.rec.commit(ev.HTTPEvent)
}

// errWriter remembers the last write error, telling a client that went away
// apart from an upstream read failure inside io.Copy.
type errWriter struct {
	io.Writer
	err error
}

func (w *errWriter) Write(b []byte) (int, error) {
	n, err := w.Writer.Write(b)
	if err != nil {
		w.err = err
	}
	return n, err
}

func (p *httpProxy) forward(w *connResponseWriter, r *http.Request) {
	id, untrack, ok := p.needAuth(w, r)
	if !ok {
		return
	}
	defer untrack()
	label := id.label
	host := r.URL.Hostname()
	ev := p.startEvent(id, "http", r.Method, host, r.URL.Port(), 80)
	defer ev.done()
	var reqCap, respCap *bodyCapture
	var respType string
	if ev != nil {
		ev.Path = MaskQuery(r.URL.RequestURI())
		h := r.Header.Clone()
		h.Del("Proxy-Authorization")
		ev.RequestHeaders = MaskHeaders(h)
		reqCap, respCap = &bodyCapture{}, &bodyCapture{}
		if r.Body != nil && r.Body != http.NoBody {
			r.Body = captureReader{ReadCloser: r.Body, c: reqCap}
		}
		defer func() {
			ev.RequestBody, ev.RequestBytes, ev.RequestBodyTruncated = MaskBody(r.Header.Get("Content-Type"), reqCap.buf), reqCap.total, reqCap.truncated()
			ev.ResponseBody, ev.ResponseBodyTruncated = MaskBody(respType, respCap.buf), respCap.truncated()
		}()
	}
	if denyTarget(host, p.srv.deny, p.srv.allow) {
		p.srv.logWarning("egress deny exec=%s method=%s target=%s reason=policy", label, r.Method, requestTarget(r))
		ev.deny()
		http.Error(w, "egress denied by policy", http.StatusForbidden)
		return
	}
	dialCtx, cancel := context.WithTimeout(r.Context(), p.srv.dialTO)
	defer cancel()
	// Absolute-form URLs usually omit the port (http://host/); dial needs one.
	addr := r.URL.Host
	if r.URL.Port() == "" {
		addr = net.JoinHostPort(host, "80")
	}
	upstream, err := p.srv.dial(dialCtx, "tcp", addr)
	if err != nil {
		var be *blockedError
		if errors.As(err, &be) {
			p.srv.logWarning("egress deny exec=%s method=%s target=%s reason=%s", label, r.Method, requestTarget(r), be)
			ev.deny()
			http.Error(w, "egress denied by policy", http.StatusForbidden)
			return
		}
		p.srv.logWarning("egress upstream error exec=%s method=%s target=%s err=%v", label, r.Method, requestTarget(r), err)
		ev.fail(err)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer upstream.Close()
	defer p.holdUpstream(id, upstream)()

	out := r.Clone(context.Background())
	out.Header.Del("Proxy-Authorization")
	out.Header.Del("Proxy-Authenticate")
	// The body is sent unconditionally; without Expect the upstream never
	// answers 100 Continue, which ReadResponse would return as final.
	out.Header.Del("Expect")
	out.RequestURI = ""
	if err := out.Write(upstream); err != nil {
		ev.fail(err)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	p.srv.logInfo("egress allow exec=%s method=%s target=%s", label, r.Method, requestTarget(r))

	uresp, err := http.ReadResponse(bufio.NewReader(upstream), r)
	if err != nil {
		ev.fail(err)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	// No uresp.Body.Close: it drains the rest of the body, so a client that
	// hung up would keep the download running; the deferred upstream.Close
	// ends it instead.
	for k, vs := range uresp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(uresp.StatusCode)
	var body io.Reader = uresp.Body
	if ev != nil {
		ev.StatusCode = uint32(uresp.StatusCode)
		h := uresp.Header.Clone()
		// OAuth redirects carry ?code= in Location.
		if loc := h.Get("Location"); loc != "" {
			h.Set("Location", MaskQuery(loc))
		}
		ev.ResponseHeaders = MaskHeaders(h)
		respType = uresp.Header.Get("Content-Type")
		body = io.TeeReader(uresp.Body, respCap)
	}
	cw := &errWriter{Writer: w}
	n, err := io.Copy(cw, body)
	if ev != nil {
		ev.ResponseBytes = uint64(n)
		switch {
		case cw.err != nil:
			ev.cancel(cw.err)
		case err != nil:
			ev.fail(err)
		}
	}
	p.srv.logInfo("egress bytes exec=%s method=%s target=%s bytes=%d", label, r.Method, requestTarget(r), n)
}

func (p *httpProxy) tunnel(w *connResponseWriter, r *http.Request) {
	id, untrack, ok := p.needAuth(w, r)
	if !ok {
		return
	}
	defer untrack()
	label := id.label
	connectHost, connectPort := r.Host, ""
	if h, port, err := net.SplitHostPort(r.Host); err == nil {
		connectHost, connectPort = h, port
	}
	// Phase 1 treats every tunnel as https: CONNECT carries no scheme.
	ev := p.startEvent(id, "https", "", connectHost, connectPort, 443)
	defer ev.done()
	if denyTarget(connectHost, p.srv.deny, p.srv.allow) {
		p.srv.logWarning("egress deny exec=%s method=CONNECT target=%s reason=policy", label, r.Host)
		ev.deny()
		http.Error(w, "egress denied by policy", http.StatusForbidden)
		return
	}
	dialCtx, cancel := context.WithTimeout(r.Context(), p.srv.dialTO)
	defer cancel()
	upstream, err := p.srv.dial(dialCtx, "tcp", r.Host)
	if err != nil {
		var be *blockedError
		if errors.As(err, &be) {
			p.srv.logWarning("egress deny exec=%s method=CONNECT target=%s reason=%s", label, r.Host, be)
			ev.deny()
			http.Error(w, "egress denied by policy", http.StatusForbidden)
			return
		}
		p.srv.logWarning("egress upstream error exec=%s method=CONNECT target=%s err=%v", label, r.Host, err)
		ev.fail(err)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer p.holdUpstream(id, upstream)()
	var upBytes, downBytes int64
	var wg sync.WaitGroup
	p.srv.logInfo("egress allow exec=%s method=CONNECT target=%s", label, r.Host)
	// The header is load-bearing: rawhttp peeks 5 bytes after the status line
	// (duplicate-status-line check) and would block forever on a bare "\r\n",
	// since the upstream sends nothing until the client speaks. RFC 9110 has
	// clients ignore Content-Length on a 2xx CONNECT.
	_, _ = w.conn.Write([]byte("HTTP/1.1 200 Connection established\r\nContent-Length: 0\r\n\r\n"))
	wg.Add(1)
	go func() {
		defer wg.Done()
		upBytes, _ = io.Copy(upstream, w.br)
		// Pass the client's EOF on, or the down copy blocks until the server
		// times out its idle connection (and the event lands after EXIT).
		if cw, ok := upstream.(interface{ CloseWrite() error }); !ok || cw.CloseWrite() != nil {
			_ = upstream.Close()
		}
	}()
	downBytes, _ = io.Copy(w.conn, upstream)
	_ = w.conn.Close()
	_ = upstream.Close()
	wg.Wait()
	if ev != nil {
		ev.RequestBytes, ev.ResponseBytes = uint64(upBytes), uint64(downBytes)
	}
	p.srv.logInfo("egress bytes exec=%s method=CONNECT target=%s up=%d down=%d", label, r.Host, upBytes, downBytes)
}
