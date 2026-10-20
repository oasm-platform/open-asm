package worker

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"strings"
	"sync"
	"time"
)

// scopeProxy is the forward proxy one agent browser session routes all of its
// traffic through (Target.createBrowserContext proxyServer). Enforcing scope
// here, not per page, also covers popups, iframes, workers and WebSockets.
type scopeProxy struct {
	ln      net.Listener
	srv     *http.Server
	rp      *httputil.ReverseProxy
	onBlock func(line string)

	mu    sync.RWMutex
	allow []string
}

func newScopeProxy(allow []string, onBlock func(line string)) (*scopeProxy, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	p := &scopeProxy{ln: ln, onBlock: onBlock}
	p.allowHosts(allow...)
	p.rp = &httputil.ReverseProxy{
		// The browser sends absolute-form URLs to a proxy; forward as is.
		Rewrite: func(r *httputil.ProxyRequest) {
			r.Out.URL = r.In.URL
			r.Out.Host = r.In.Host
		},
		Transport: &http.Transport{DialContext: (&net.Dialer{Timeout: 10 * time.Second}).DialContext},
	}
	p.srv = &http.Server{Handler: p, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = p.srv.Serve(ln) }()
	return p, nil
}

func (p *scopeProxy) addr() string { return p.ln.Addr().String() }

func (p *scopeProxy) close() { _ = p.srv.Close() }

// allowHosts extends the scope; entries are a hostname or "*.suffix".
func (p *scopeProxy) allowHosts(hosts ...string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, h := range hosts {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			p.allow = append(p.allow, h)
		}
	}
}

func (p *scopeProxy) scope() []string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return append([]string(nil), p.allow...)
}

// allowed reports whether hostport (port optional) is in scope.
func (p *scopeProxy) allowed(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.ToLower(strings.Trim(host, "[]"))
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, a := range p.allow {
		if suffix, ok := strings.CutPrefix(a, "*."); ok {
			if host == suffix || strings.HasSuffix(host, "."+suffix) {
				return true
			}
		} else if host == a {
			return true
		}
	}
	return false
}

func (p *scopeProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if r.Method != http.MethodConnect {
		if r.URL.Host == "" {
			http.Error(w, "proxy requires an absolute URL", http.StatusBadRequest)
			return
		}
		host = r.URL.Host
	}
	if !p.allowed(host) {
		target := host
		if r.Method != http.MethodConnect {
			target = r.URL.String()
		}
		if p.onBlock != nil {
			p.onBlock("BLOCKED " + r.Method + " " + target)
		}
		http.Error(w, "blocked: host not in browser session scope", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodConnect {
		p.rp.ServeHTTP(w, r)
		return
	}
	p.tunnel(w, r)
}

func (p *scopeProxy) tunnel(w http.ResponseWriter, r *http.Request) {
	dialCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	upstream, err := (&net.Dialer{}).DialContext(dialCtx, "tcp", r.Host)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		_ = upstream.Close()
		http.Error(w, "hijack unsupported", http.StatusInternalServerError)
		return
	}
	client, buf, err := hj.Hijack()
	if err != nil {
		_ = upstream.Close()
		return
	}
	_, _ = client.Write([]byte("HTTP/1.1 200 Connection established\r\n\r\n"))
	go func() {
		// Bytes the client sent right after CONNECT may already be buffered.
		_, _ = io.Copy(upstream, buf)
		_ = upstream.Close()
	}()
	_, _ = io.Copy(client, upstream)
	_ = client.Close()
}
