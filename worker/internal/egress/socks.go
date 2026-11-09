package egress

import (
	"context"
	"errors"
	"net"
	"sync"
	"sync/atomic"
	"time"

	socks5 "github.com/things-go/go-socks5"
)

// tokenCredentials validates SOCKS5 username/password against the same
// AuthFunc as the HTTP half: the token is accepted in either slot.
type tokenCredentials struct{ auth AuthFunc }

func (c *tokenCredentials) Valid(user, password, _ string) bool {
	if _, ok := c.auth(user); ok {
		return true
	}
	if password != "" {
		if _, ok := c.auth(password); ok {
			return true
		}
	}
	return false
}

// newSocksServer builds the CONNECT-only SOCKS5 server sharing auth and the
// vetted dialer with the HTTP half. BIND and UDP ASSOCIATE stay refused:
// the egress proxy carries scanning TCP, nothing else.
func (s *Server) newSocksServer(conn net.Conn) *socks5.Server {
	return socks5.NewServer(
		socks5.WithCredential(&tokenCredentials{auth: s.auth}),
		socks5.WithRule(&socks5.PermitCommand{EnableConnect: true}),
		// WithDialAndRequest (not WithDial): the request carries DestAddr
		// plus the authenticated username, so denials log WHO went WHERE
		// and allowed sessions log byte counts like the HTTP half.
		socks5.WithDialAndRequest(func(ctx context.Context, network, addr string, req *socks5.Request) (net.Conn, error) {
			_ = conn.SetDeadline(time.Time{})
			label := ""
			if req != nil && req.AuthContext != nil {
				for _, slot := range []string{"username", "password"} {
					if l, ok := s.auth(req.AuthContext.Payload[slot]); ok {
						label = l
						break
					}
				}
			}
			c, err := s.dial(ctx, network, addr)
			if err != nil {
				var be *blockedError
				if errors.As(err, &be) {
					s.logWarning("egress deny exec=%s method=SOCKS5 target=%s reason=%s", label, addr, be)
				} else {
					s.logWarning("egress upstream error exec=%s method=SOCKS5 target=%s err=%v", label, addr, err)
				}
				return nil, err
			}
			s.logInfo("egress allow exec=%s method=SOCKS5 target=%s", label, addr)
			// The library copies client→upstream through Write and
			// upstream→client through Read on this conn, so wrapping both
			// counts exact per-direction bytes for the session-end line.
			return &countConn{Conn: c, label: label, target: addr, srv: s}, nil
		}),
	)
}

// countConn wraps an allowed SOCKS5 upstream and logs tunneled bytes when
// the session ends, matching the HTTP half's allow/bytes pair.
// Read and Write run on separate library goroutines, hence the atomics.
type countConn struct {
	net.Conn
	label  string
	target string
	srv    *Server
	up     atomic.Int64
	down   atomic.Int64
	once   sync.Once
}

func (c *countConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	c.down.Add(int64(n))
	return n, err
}

func (c *countConn) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	c.up.Add(int64(n))
	return n, err
}

// CloseWrite lets the library half-close upstream when the client is done.
func (c *countConn) CloseWrite() error { return closeWrite(c.Conn) }

// Close runs once both copy directions are done (library defers it).
func (c *countConn) Close() error {
	c.once.Do(func() {
		c.srv.logInfo("egress bytes exec=%s method=SOCKS5 target=%s up=%d down=%d", c.label, c.target, c.up.Load(), c.down.Load())
	})
	return c.Conn.Close()
}

// serveSocks handles one sniff-routed SOCKS5 session. The handshake gets the
// same 10s budget as the HTTP half; the deadline is lifted once auth passed
// and the upstream dial starts, so an unauthenticated client cannot park.
func (s *Server) serveSocks(conn net.Conn) {
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	srv := s.newSocksServer(conn)
	if err := srv.ServeConn(conn); err != nil {
		s.logWarning("egress socks5 session ended: %v", err)
	}
}
