package egress

import (
	"context"
	"errors"
	"net"

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
func (s *Server) newSocksServer() *socks5.Server {
	return socks5.NewServer(
		socks5.WithCredential(&tokenCredentials{auth: s.auth}),
		socks5.WithRule(&socks5.PermitCommand{EnableConnect: true}),
		// WithDialAndRequest (not WithDial): the request carries DestAddr
		// plus the authenticated username, so denials log WHO went WHERE
		// and allowed sessions log byte counts like the HTTP half.
		socks5.WithDialAndRequest(func(ctx context.Context, network, addr string, req *socks5.Request) (net.Conn, error) {
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
type countConn struct {
	net.Conn
	label  string
	target string
	srv    *Server
	up     int64
	down   int64
	done   bool
}

func (c *countConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 {
		c.down += int64(n)
	}
	if err != nil {
		c.finish()
	}
	return n, err
}

func (c *countConn) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	if n > 0 {
		c.up += int64(n)
	}
	return n, err
}

func (c *countConn) Close() error {
	c.finish()
	return c.Conn.Close()
}

func (c *countConn) finish() {
	if c.done {
		return
	}
	c.done = true
	c.srv.logInfo("egress bytes exec=%s method=SOCKS5 target=%s up=%d down=%d", c.label, c.target, c.up, c.down)
}

// serveSocks handles one sniff-routed SOCKS5 session.
func (s *Server) serveSocks(conn net.Conn) {
	srv := s.newSocksServer()
	if err := srv.ServeConn(conn); err != nil {
		s.logWarning("egress socks5 session ended: %v", err)
	}
}
