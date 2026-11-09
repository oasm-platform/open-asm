package egress

import (
	"context"
	"fmt"
	"io"
	"net"

	socks5 "github.com/armon/go-socks5"
)

const (
	socks5Version        = uint8(5)
	socksUserPassCode    = uint8(2)
	socksUserPassVersion = uint8(1)
	socksAuthSuccess     = uint8(0)
	socksAuthFailure     = uint8(1)
)

// tokenAuthenticator validates SOCKS5 username/password against the same
// AuthFunc as the HTTP half: the token is accepted in either slot (the
// wire format mirrors UserPassAuthenticator in armon/go-socks5).
type tokenAuthenticator struct{ auth AuthFunc }

func (a *tokenAuthenticator) GetCode() uint8 { return 2 } // username/password

func (a *tokenAuthenticator) Authenticate(reader io.Reader, writer io.Writer) (*socks5.AuthContext, error) {
	// Tell the client to use username/password auth (the method choice is
	// sent from inside Authenticate — mirrors UserPassAuthenticator).
	if _, err := writer.Write([]byte{socks5Version, socksUserPassCode}); err != nil {
		return nil, err
	}
	fail := func() (*socks5.AuthContext, error) {
		_, _ = writer.Write([]byte{socksUserPassVersion, socksAuthFailure})
		return nil, fmt.Errorf("socks5 authentication failed")
	}
	header := []byte{0, 0}
	if _, err := io.ReadAtLeast(reader, header, 2); err != nil {
		return nil, err
	}
	if header[0] != socksUserPassVersion {
		return nil, fmt.Errorf("unsupported socks5 auth version: %v", header[0])
	}
	user := make([]byte, int(header[1]))
	if _, err := io.ReadAtLeast(reader, user, len(user)); err != nil {
		return nil, err
	}
	if _, err := reader.Read(header[:1]); err != nil {
		return nil, err
	}
	pass := make([]byte, int(header[0]))
	if _, err := io.ReadAtLeast(reader, pass, len(pass)); err != nil {
		return nil, err
	}
	u, pw := string(user), string(pass)
	if _, ok := a.auth(u); ok {
		if _, err := writer.Write([]byte{socksUserPassVersion, socksAuthSuccess}); err != nil {
			return nil, err
		}
		return &socks5.AuthContext{Method: 2, Payload: map[string]string{"exec": u}}, nil
	}
	if pw != "" {
		if _, ok := a.auth(pw); ok {
			if _, err := writer.Write([]byte{socksUserPassVersion, socksAuthSuccess}); err != nil {
				return nil, err
			}
			return &socks5.AuthContext{Method: 2, Payload: map[string]string{"exec": pw}}, nil
		}
	}
	return fail()
}

// newSocksServer builds the CONNECT-only SOCKS5 server sharing auth and the
// vetted dialer with the HTTP half. BIND and UDP ASSOCIATE stay refused:
// the egress proxy carries scanning TCP, nothing else.
func (s *Server) newSocksServer() (*socks5.Server, error) {
	return socks5.New(&socks5.Config{
		AuthMethods: []socks5.Authenticator{&tokenAuthenticator{auth: s.auth}},
		Rules:       &socks5.PermitCommand{EnableConnect: true},
		Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return s.dial(ctx, network, addr)
		},
	})
}

// serveSocks handles one sniff-routed SOCKS5 session (Task 3: real handler).
func (s *Server) serveSocks(conn net.Conn) {
	srv, err := s.newSocksServer()
	if err != nil {
		s.logWarning("egress socks5 init failed: %v", err)
		_ = conn.Close()
		return
	}
	if err := srv.ServeConn(conn); err != nil {
		s.logWarning("egress socks5 session ended: %v", err)
	}
}
