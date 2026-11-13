package worker

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"strings"
	"syscall"
	"time"

	"oasm-worker/internal/egress"
)

// publicProxy is the forward proxy each browser session on a shared
// (sandboxed) worker routes all of its traffic through
// (Target.createBrowserContext proxyServer). Any host may be browsed, but
// only public addresses are dialed: the worker's local network is the
// platform's, not the tenant's. The check runs on the address each
// connection actually dials, after DNS, so a name that resolves somewhere
// local is refused too. Sessions on other workers use no proxy.
type publicProxy struct {
	ln      net.Listener
	srv     *http.Server
	rp      *httputil.ReverseProxy
	tr      *http.Transport
	dialer  *net.Dialer
	onBlock func(line string)
	// dialable decides which addresses may be dialed; egress.IsPublicAddr
	// outside tests.
	dialable func(netip.Addr) bool
}

func newPublicProxy(onBlock func(line string)) (*publicProxy, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	p := &publicProxy{ln: ln, onBlock: onBlock, dialable: egress.IsPublicAddr}
	p.dialer = &net.Dialer{Timeout: 10 * time.Second, Control: p.checkDial}
	p.tr = &http.Transport{DialContext: p.dialer.DialContext, IdleConnTimeout: 30 * time.Second}
	p.rp = &httputil.ReverseProxy{
		// The browser sends absolute-form URLs to a proxy; forward as is.
		Rewrite: func(r *httputil.ProxyRequest) {
			r.Out.URL = r.In.URL
			r.Out.Host = r.In.Host
		},
		Transport:    p.tr,
		ErrorHandler: p.upstreamError,
	}
	p.srv = &http.Server{Handler: p, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = p.srv.Serve(ln) }()
	return p, nil
}

func (p *publicProxy) addr() string { return p.ln.Addr().String() }

// close is a no-op on nil, the proxy of a session that has none.
func (p *publicProxy) close() {
	if p == nil {
		return
	}
	_ = p.srv.Close()
	p.tr.CloseIdleConnections()
}

// blockedAddrError is a dial refused by checkDial.
type blockedAddrError struct{ ip netip.Addr }

func (e *blockedAddrError) Error() string {
	return fmt.Sprintf("%s is not a public address (this worker is shared)", e.ip)
}

// checkDial vets the address a connection is about to use, after DNS.
func (p *publicProxy) checkDial(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return err
	}
	if ip = ip.Unmap().WithZone(""); !p.dialable(ip) {
		return &blockedAddrError{ip: ip}
	}
	return nil
}

func (p *publicProxy) block(what string) {
	if p.onBlock != nil {
		p.onBlock("BLOCKED " + what)
	}
}

func (p *publicProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		p.tunnel(w, r)
		return
	}
	if r.URL.Host == "" {
		http.Error(w, "proxy requires an absolute URL", http.StatusBadRequest)
		return
	}
	p.rp.ServeHTTP(w, r)
}

// upstreamError answers a failed forward, reporting a refused address.
func (p *publicProxy) upstreamError(w http.ResponseWriter, r *http.Request, err error) {
	var be *blockedAddrError
	if errors.As(err, &be) {
		p.block(fmt.Sprintf("%s %s (%s)", r.Method, r.URL, be))
		http.Error(w, "blocked: "+be.Error(), http.StatusForbidden)
		return
	}
	http.Error(w, err.Error(), http.StatusBadGateway)
}

func (p *publicProxy) tunnel(w http.ResponseWriter, r *http.Request) {
	dialCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	upstream, err := p.dialer.DialContext(dialCtx, "tcp", r.Host)
	if err != nil {
		var be *blockedAddrError
		if errors.As(err, &be) {
			p.block(fmt.Sprintf("CONNECT %s (%s)", r.Host, be))
			http.Error(w, "blocked: "+be.Error(), http.StatusForbidden)
			return
		}
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

// sharedWorkerHostErr refuses up front a host that a shared worker's proxy
// would block anyway: localhost or a non-public IP.
func sharedWorkerHostErr(host string) error {
	h := strings.ToLower(strings.Trim(host, "[]"))
	if h == "localhost" || strings.HasSuffix(h, ".localhost") {
		return fmt.Errorf("%s is the worker itself; this worker is shared, so the browser reaches only public hosts", host)
	}
	if ip, err := netip.ParseAddr(h); err == nil && !egress.IsPublicAddr(ip) {
		return fmt.Errorf("%s is not a public address; this worker is shared, so the browser reaches only public hosts", host)
	}
	return nil
}
