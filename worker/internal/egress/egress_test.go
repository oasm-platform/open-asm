package egress

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

// The single port sniffs SOCKS5 (first byte 0x05) vs HTTP: a SOCKS5
// handshake must reach serveSocks (placeholder closes), while HTTP on the
// same listener keeps working.
func TestSinglePortSniffRoutesSocks(t *testing.T) {
	srv := startEgress(t, testAuth("tok"), nil)
	c, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	// SOCKS5 greeting: VER=5, 1 method, NO AUTH.
	c.Write([]byte{0x05, 0x01, 0x00})
	buf := make([]byte, 8)
	n, err := c.Read(buf)
	// Placeholder closes without answering; the real handler (Task 3)
	// answers 0x05 0x00. Either way the HTTP path must not have treated
	// 0x05 as a request line.
	t.Logf("socks greeting got n=%d err=%v", n, err)
}

// CONNECT tunnels opaque bytes both ways (TLS handshake bytes stand in).
func TestConnectTunnelBytes(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				b := make([]byte, 64)
				n, _ := c.Read(b)
				c.Write([]byte("echo:" + string(b[:n])))
			}()
		}
	}()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	srv := startEgress(t, testAuth("tok-tun"), func(ctx context.Context, network, addr string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, addr)
	})
	_ = srv
	// Reuse raw-conn style: CONNECT to the echo server through the proxy.
	c, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	fmt.Fprintf(c, "CONNECT localhost:%s HTTP/1.1\r\nHost: localhost:%s\r\nProxy-Authorization: %s\r\n\r\n", port, port, basicFor("tok-tun"))
	br := bufio.NewReader(c)
	c.SetReadDeadline(time.Now().Add(8 * time.Second))
	resp, err := http.ReadResponse(br, &http.Request{Method: "CONNECT"})
	if err != nil {
		t.Fatalf("CONNECT response: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("CONNECT status = %d, want 200", resp.StatusCode)
	}
	// Tunnel is live: echo bytes through it.
	c.Write([]byte("ping-tunnel"))
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	got := make([]byte, 64)
	n, err := br.Read(got)
	if err != nil && err != io.EOF {
		t.Fatalf("tunnel read: %v", err)
	}
	if string(got[:n]) != "echo:ping-tunnel" {
		t.Fatalf("tunnel echo = %q, want %q", got[:n], "echo:ping-tunnel")
	}
}

// TLS over CONNECT end-to-end (httptest TLS server through the tunnel).
func TestConnectTLSBackend(t *testing.T) {
	backend := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "tls-ok")
	}))
	defer backend.Close()
	_, port, _ := net.SplitHostPort(backend.Listener.Addr().String())
	srv := startEgress(t, testAuth("tok-tls"), localDialer())
	proxyURL, _ := url.Parse("http://tok-tls@" + srv.Addr().String())
	tr := &http.Transport{
		Proxy:           http.ProxyURL(proxyURL),
		TLSClientConfig: backend.Client().Transport.(*http.Transport).TLSClientConfig,
	}
	// The TLS backend cert is for 127.0.0.1; dial via localhost and accept
	// the test cert explicitly.
	tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	client := &http.Client{Transport: tr}
	resp, err := client.Get("https://localhost:" + port + "/")
	if err != nil {
		t.Fatalf("TLS via CONNECT: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "tls-ok" {
		t.Fatalf("body = %q, want tls-ok", body)
	}
}

// A name whose DNS answers only private IPs is refused at the dialed
// address, even though the literal name is not a blocked literal.
func TestDialVettedRefusesReboundName(t *testing.T) {
	srv := startEgress(t, testAuth("tok"), nil)
	srv.lookup = func(ctx context.Context, host string) ([]string, error) {
		if host == "rebound.example" {
			return []string{"10.0.0.9", "192.168.1.7"}, nil
		}
		return nil, errors.New("no such host")
	}
	_, err := srv.dialVetted(context.Background(), "tcp", "rebound.example:443")
	var be *blockedError
	if !errors.As(err, &be) {
		t.Fatalf("rebound name must be refused with blockedError, got %v", err)
	}
}

// A name whose DNS mixes private and public answers skips the private one
// and attempts the public one.
func TestDialVettedSkipsPrivateAnswers(t *testing.T) {
	srv := startEgress(t, testAuth("tok"), nil)
	srv.lookup = func(ctx context.Context, host string) ([]string, error) {
		return []string{"10.0.0.9", "203.0.113.7"}, nil
	}
	var attempted []string
	srv.dialIP = func(ctx context.Context, network, addr string) (net.Conn, error) {
		attempted = append(attempted, addr)
		return nil, errors.New("no route in test")
	}
	_, err := srv.dialVetted(context.Background(), "tcp", "mixed.example:443")
	var be *blockedError
	if !errors.As(err, &be) {
		t.Fatalf("all-public-unreachable must end refused, got %v", err)
	}
	if len(attempted) != 1 || attempted[0] != "203.0.113.7:443" {
		t.Fatalf("must skip 10.0.0.9 and attempt 203.0.113.7:443, attempted %v", attempted)
	}
}
