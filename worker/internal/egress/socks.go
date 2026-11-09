package egress

import (
	"context"
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
		socks5.WithDial(func(ctx context.Context, network, addr string) (net.Conn, error) {
			return s.dial(ctx, network, addr)
		}),
	)
}

// serveSocks handles one sniff-routed SOCKS5 session.
func (s *Server) serveSocks(conn net.Conn) {
	srv := s.newSocksServer()
	if err := srv.ServeConn(conn); err != nil {
		s.logWarning("egress socks5 session ended: %v", err)
	}
}
