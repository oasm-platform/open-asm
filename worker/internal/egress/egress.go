package egress

import (
	"context"
	"crypto/subtle"
	"fmt"
	"io"
	"net"
	"net/netip"
	"time"
)

// Logger receives egress proxy lifecycle log lines (proxy dials, denials,
// byte counts). Any worker Logger (Info/Warning) satisfies it structurally.
// A nil logger disables logging (safe).
type Logger interface {
	Info(msg string, args ...any)
	Warning(msg string, args ...any)
}

// AuthFunc validates one proxy credential and returns the execution label
// for log lines. Constant-time comparison is the caller's job; subtleEqual
// is provided for it.
type AuthFunc func(token string) (label string, ok bool)

func subtleEqual(a, b string) bool {
	if len(a) == 0 || len(b) == 0 {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// Options tunes the egress listener.
type Options struct {
	DenyHosts   []string
	DialTimeout time.Duration
	Logger      Logger
}

// Server is the worker-local egress proxy: one listener carrying HTTP
// forwarding (+CONNECT tunnels) and SOCKS5, told apart by sniffing the
// first client byte (0x05 = SOCKS5, else HTTP). It binds all interfaces
// like the connector gRPC server and is never published to the host.
type Server struct {
	lis    net.Listener
	auth   AuthFunc
	deny   []string
	dialTO time.Duration
	logger Logger
	proxy  *httpProxy
	dial   func(ctx context.Context, network, addr string) (net.Conn, error)
}

// ProxyURL builds the HTTP proxy URL containers use (token as userinfo).
func ProxyURL(host string, port int, token string) string {
	return fmt.Sprintf("http://%s@%s", token, net.JoinHostPort(host, fmt.Sprintf("%d", port)))
}

// SocksURL builds the SOCKS5 proxy URL containers use (h-variant so the
// proxy resolves names).
func SocksURL(host string, port int, token string) string {
	return fmt.Sprintf("socks5h://%s@%s", token, net.JoinHostPort(host, fmt.Sprintf("%d", port)))
}

// NewServer creates the egress listener on addr (e.g. ":26277").
func NewServer(addr string, auth AuthFunc, opts Options) (*Server, error) {
	if auth == nil {
		return nil, fmt.Errorf("egress: auth must not be nil")
	}
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("egress: listen %s: %w", addr, err)
	}
	to := opts.DialTimeout
	if to == 0 {
		to = 10 * time.Second
	}
	s := &Server{lis: lis, auth: auth, deny: opts.DenyHosts, dialTO: to, logger: opts.Logger}
	s.dial = s.dialVetted
	s.proxy = newHTTPProxy(s)
	return s, nil
}

// SetLogger wires a lifecycle logger. Nil disables logging (safe).
func (s *Server) SetLogger(l Logger) {
	s.logger = l
}

func (s *Server) logInfo(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Info(msg, args...)
	}
}

func (s *Server) logWarning(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Warning(msg, args...)
	}
}

// Addr returns the listener address (useful with ":0" for a random port).
func (s *Server) Addr() net.Addr { return s.lis.Addr() }

// Port returns the TCP port the listener actually bound.
func (s *Server) Port() int {
	if a, ok := s.lis.Addr().(*net.TCPAddr); ok {
		return a.Port
	}
	return 0
}

// Close stops the listener immediately.
func (s *Server) Close() error { return s.lis.Close() }

// Serve accepts connections until ctx is cancelled or the listener closes.
func (s *Server) Serve(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		_ = s.lis.Close()
	}()
	for {
		conn, err := s.lis.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				if ne, ok := err.(net.Error); ok && ne.Timeout() {
					continue
				}
				return nil
			}
		}
		go s.route(conn)
	}
}

func (s *Server) route(conn net.Conn) {
	var one [1]byte
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	n, err := io.ReadFull(conn, one[:])
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil || n != 1 {
		_ = conn.Close()
		return
	}
	if one[0] == 0x05 {
		s.serveSocks(&peekedConn{Conn: conn, peeked: one[:]})
		return
	}
	s.proxy.serveConn(&peekedConn{Conn: conn, peeked: one[:]})
}

// serveSocks handles SOCKS5 sessions. Task 3 replaces this placeholder with
// the real armon/go-socks5 handler.
func (s *Server) serveSocks(conn net.Conn) {
	s.logWarning("egress socks5 not-ready — closing")
	_ = conn.Close()
}

// dialVetted dials upstream after vetting: literal deny check first, then
// resolve-then-check so a rebound name is refused at the dialed address.
func (s *Server) dialVetted(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if denyTarget(host, s.deny) {
		return nil, &blockedError{target: addr}
	}
	addrs, err := net.DefaultResolver.LookupHost(ctx, host)
	if err != nil {
		if ip, perr := netip.ParseAddr(stripBrackets(host)); perr == nil {
			if !IsPublicAddr(ip) {
				return nil, &blockedError{target: addr}
			}
			return s.dialRaw(ctx, network, addr)
		}
		return nil, err
	}
	for _, a := range addrs {
		ip, err := netip.ParseAddr(a)
		if err != nil || !IsPublicAddr(ip) {
			continue
		}
		c, err := s.dialRaw(ctx, network, net.JoinHostPort(a, port))
		if err == nil {
			return c, nil
		}
	}
	return nil, &blockedError{target: addr}
}

func (s *Server) dialRaw(ctx context.Context, network, addr string) (net.Conn, error) {
	d := &net.Dialer{Timeout: s.dialTO}
	return d.DialContext(ctx, network, addr)
}

func stripBrackets(h string) string {
	if len(h) > 1 && h[0] == '[' && h[len(h)-1] == ']' {
		return h[1 : len(h)-1]
	}
	return h
}

// blockedError is a dial refused by egress policy.
type blockedError struct{ target string }

func (e *blockedError) Error() string { return "egress denied: " + e.target }
