package egress

import (
	"bufio"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
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
	br := bufio.NewReader(conn)
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	req, err := http.ReadRequest(br)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
		_ = conn.Close()
		return
	}
	rw := &connResponseWriter{conn: conn, br: br, header: http.Header{}}
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

func (p *httpProxy) authenticate(r *http.Request) (string, bool) {
	user, pass, ok := proxyCredentials(r)
	if !ok {
		return "", false
	}
	if label, ok := p.srv.auth(user); ok {
		return label, true
	}
	if pass != "" {
		if label, ok := p.srv.auth(pass); ok {
			return label, true
		}
	}
	return "", false
}

func (p *httpProxy) needAuth(w http.ResponseWriter, r *http.Request) (string, bool) {
	label, ok := p.authenticate(r)
	if !ok {
		w.Header().Set("Proxy-Authenticate", `Basic realm="oasm-egress"`)
		http.Error(w, "proxy authentication required", http.StatusProxyAuthRequired)
		p.srv.logWarning("egress deny method=%s target=%s reason=auth", r.Method, requestTarget(r))
		return "", false
	}
	return label, true
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

func (p *httpProxy) forward(w *connResponseWriter, r *http.Request) {
	label, ok := p.needAuth(w, r)
	if !ok {
		return
	}
	host := r.URL.Hostname()
	if denyTarget(host, p.srv.deny) {
		p.srv.logWarning("egress deny exec=%s method=%s target=%s reason=policy", label, r.Method, requestTarget(r))
		http.Error(w, "egress denied by policy", http.StatusForbidden)
		return
	}
	dialCtx, cancel := context.WithTimeout(r.Context(), p.srv.dialTO)
	defer cancel()
	upstream, err := p.srv.dial(dialCtx, "tcp", r.URL.Host)
	if err != nil {
		var be *blockedError
		if errors.As(err, &be) {
			p.srv.logWarning("egress deny exec=%s method=%s target=%s reason=%s", label, r.Method, requestTarget(r), be)
			http.Error(w, "egress denied by policy", http.StatusForbidden)
			return
		}
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer upstream.Close()

	out := r.Clone(context.Background())
	out.Header.Del("Proxy-Authorization")
	out.Header.Del("Proxy-Authenticate")
	out.RequestURI = ""
	if err := out.Write(upstream); err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	p.srv.logInfo("egress allow exec=%s method=%s target=%s", label, r.Method, requestTarget(r))

	uresp, err := http.ReadResponse(bufio.NewReader(upstream), r)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer uresp.Body.Close()
	for k, vs := range uresp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(uresp.StatusCode)
	n, _ := io.Copy(w, uresp.Body)
	p.srv.logInfo("egress bytes exec=%s method=%s target=%s bytes=%d", label, r.Method, requestTarget(r), n)
}

func (p *httpProxy) tunnel(w *connResponseWriter, r *http.Request) {
	label, ok := p.needAuth(w, r)
	if !ok {
		return
	}
	connectHost := r.Host
	if h, _, err := net.SplitHostPort(r.Host); err == nil {
		connectHost = h
	}
	if denyTarget(connectHost, p.srv.deny) {
		p.srv.logWarning("egress deny exec=%s method=CONNECT target=%s reason=policy", label, r.Host)
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
			http.Error(w, "egress denied by policy", http.StatusForbidden)
			return
		}
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	var upBytes, downBytes int64
	var wg sync.WaitGroup
	p.srv.logInfo("egress allow exec=%s method=CONNECT target=%s", label, r.Host)
	_, _ = w.conn.Write([]byte("HTTP/1.1 200 Connection established\r\n\r\n"))
	wg.Add(1)
	go func() {
		defer wg.Done()
		upBytes, _ = io.Copy(upstream, w.br)
	}()
	downBytes, _ = io.Copy(w.conn, upstream)
	_ = w.conn.Close()
	_ = upstream.Close()
	wg.Wait()
	p.srv.logInfo("egress bytes exec=%s method=CONNECT target=%s up=%d down=%d", label, r.Host, upBytes, downBytes)
}
