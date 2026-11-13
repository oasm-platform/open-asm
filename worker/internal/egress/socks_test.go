package egress

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"golang.org/x/net/proxy"
)

// Valid SOCKS5 credential dials a TCP echo server through the same
// listener that also serves HTTP.
func TestSocks5ValidTokenDials(t *testing.T) {
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
				c.Write([]byte("socks-echo:" + string(b[:n])))
			}()
		}
	}()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	srv := startEgress(t, testAuth("tok-s5"), localDialer())
	dialer, err := proxy.SOCKS5("tcp", srv.Addr().String(), &proxy.Auth{User: "tok-s5"}, proxy.Direct)
	if err != nil {
		t.Fatal(err)
	}
	c, err := dialer.Dial("tcp", "localhost:"+port)
	if err != nil {
		t.Fatalf("socks5 dial: %v", err)
	}
	defer c.Close()
	c.SetDeadline(time.Now().Add(5 * time.Second))
	fmt.Fprint(c, "hello-socks")
	got := make([]byte, 64)
	n, _ := c.Read(got)
	if string(got[:n]) != "socks-echo:hello-socks" {
		t.Fatalf("socks echo = %q", got[:n])
	}
}

// Invalid SOCKS5 credential is rejected.
func TestSocks5InvalidTokenRejected(t *testing.T) {
	srv := startEgress(t, testAuth("tok-s5-ok"), nil)
	dialer, err := proxy.SOCKS5("tcp", srv.Addr().String(), &proxy.Auth{User: "wrong"}, proxy.Direct)
	if err != nil {
		t.Fatal(err)
	}
	c, err := dialer.Dial("tcp", "localhost:1")
	if err == nil {
		c.Close()
		t.Fatal("socks5 with wrong token must fail")
	}
}

// SOCKS5 to a blocked IP is refused.
func TestSocks5BlockedTargetRefused(t *testing.T) {
	srv := startEgress(t, testAuth("tok-s5-b"), nil)
	dialer, err := proxy.SOCKS5("tcp", srv.Addr().String(), &proxy.Auth{User: "tok-s5-b"}, proxy.Direct)
	if err != nil {
		t.Fatal(err)
	}
	c, err := dialer.Dial("tcp", "169.254.169.254:80")
	if err == nil {
		c.Close()
		t.Fatal("socks5 to metadata IP must fail")
	}
}

// HTTP CONNECT still works on the same listener while SOCKS5 is active.
func TestSinglePortHTTPAndSocksCoexist(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "coexist-ok")
	}))
	defer backend.Close()
	srv := startEgress(t, testAuth("tok-co"), localDialer())
	proxyURL, _ := url.Parse("http://tok-co@" + srv.Addr().String())
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get(backendURL(t, backend) + "/")
	if err != nil {
		t.Fatalf("HTTP alongside SOCKS5: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "coexist-ok" {
		t.Fatalf("body = %q", body)
	}
}
