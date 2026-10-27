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
	// dialable decides which addresses may be dialed; isPublicAddr outside
	// tests.
	dialable func(netip.Addr) bool
}

func newPublicProxy(onBlock func(line string)) (*publicProxy, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	p := &publicProxy{ln: ln, onBlock: onBlock, dialable: isPublicAddr}
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

// nonPublicPrefixes are special-purpose ranges that netip does not classify
// as private, loopback or link-local but that are not on the internet.
var nonPublicPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),      // "this network"
	netip.MustParsePrefix("100.64.0.0/10"),  // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),   // IETF protocol assignments
	netip.MustParsePrefix("198.18.0.0/15"),  // benchmarking
	netip.MustParsePrefix("240.0.0.0/4"),    // reserved
	netip.MustParsePrefix("::/96"),          // IPv4-compatible (deprecated)
	netip.MustParsePrefix("100::/64"),       // discard
	netip.MustParsePrefix("64:ff9b:1::/48"), // local-use NAT64
}

// isPublicAddr reports whether ip is a unicast address on the internet. An
// IPv4 address embedded by NAT64 or 6to4 is judged by that IPv4 address.
func isPublicAddr(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return false
	}
	for _, pfx := range nonPublicPrefixes {
		if pfx.Contains(ip) {
			return false
		}
	}
	if ip.Is6() {
		b := ip.As16()
		switch {
		case netip.MustParsePrefix("64:ff9b::/96").Contains(ip):
			return isPublicAddr(netip.AddrFrom4([4]byte(b[12:16])))
		case netip.MustParsePrefix("2002::/16").Contains(ip):
			return isPublicAddr(netip.AddrFrom4([4]byte(b[2:6])))
		}
	}
	return true
}

// sharedWorkerHostErr refuses up front a host that a shared worker's proxy
// would block anyway: localhost or a non-public IP.
func sharedWorkerHostErr(host string) error {
	h := strings.ToLower(strings.Trim(host, "[]"))
	if h == "localhost" || strings.HasSuffix(h, ".localhost") {
		return fmt.Errorf("%s is the worker itself; this worker is shared, so the browser reaches only public hosts", host)
	}
	if ip, err := netip.ParseAddr(h); err == nil && !isPublicAddr(ip) {
		return fmt.Errorf("%s is not a public address; this worker is shared, so the browser reaches only public hosts", host)
	}
	return nil
}
