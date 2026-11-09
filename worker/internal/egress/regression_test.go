package egress

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"golang.org/x/net/proxy"
)

// Absolute-form http://host/ has no port; the proxy must dial host:80.
func TestHTTPForwardPortlessURLDialsPort80(t *testing.T) {
	srv := startEgress(t, testAuth("tok"), nil)
	srv.lookup = func(context.Context, string) ([]string, error) { return []string{"93.184.216.34"}, nil }
	dialed := make(chan string, 1)
	srv.dialIP = func(_ context.Context, _, addr string) (net.Conn, error) {
		dialed <- addr
		return nil, errors.New("stop")
	}
	pu, _ := url.Parse("http://tok@" + srv.Addr().String())
	c := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pu)}}
	resp, err := c.Get("http://example.com/")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	select {
	case got := <-dialed:
		if got != "93.184.216.34:80" {
			t.Fatalf("dialed %q, want 93.184.216.34:80", got)
		}
	default:
		t.Fatalf("no upstream dial (status %d)", resp.StatusCode)
	}
}

// A client sending Expect: 100-continue must get the final response, not 100.
func TestHTTPForwardExpectContinue(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_, _ = w.Write([]byte("got:" + string(b)))
	}))
	defer backend.Close()
	srv := startEgress(t, testAuth("tok"), localDialer())
	pu, _ := url.Parse("http://tok@" + srv.Addr().String())
	c := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{Proxy: http.ProxyURL(pu), ExpectContinueTimeout: time.Second}}
	req, _ := http.NewRequest(http.MethodPost, backendURL(t, backend)+"/", strings.NewReader("payload"))
	req.Header.Set("Expect", "100-continue")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || string(body) != "got:payload" {
		t.Fatalf("status=%d body=%q", resp.StatusCode, body)
	}
}

// Upstream writes then closes: the SOCKS5 client must see EOF, not hang.
func TestSocks5UpstreamCloseReachesClient(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		_, _ = c.Write([]byte("banner"))
		_ = c.Close()
	}()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	srv := startEgress(t, testAuth("tok"), localDialer())
	d, _ := proxy.SOCKS5("tcp", srv.Addr().String(), &proxy.Auth{User: "tok"}, proxy.Direct)
	c, err := d.Dial("tcp", "localhost:"+port)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(3 * time.Second))
	b, err := io.ReadAll(c)
	if err != nil || string(b) != "banner" {
		t.Fatalf("got %q err=%v, want banner + EOF", b, err)
	}
}
