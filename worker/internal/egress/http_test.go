package egress

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func testAuth(token string) AuthFunc {
	return func(got string) (string, bool) {
		if subtleEqual(got, token) {
			return "exec-test", true
		}
		return "", false
	}
}

// testLogger adapts a func for tests.
type testLogger func(format string, args ...any)

func (f testLogger) Info(msg string, args ...any)    { f(msg, args...) }
func (f testLogger) Warning(msg string, args ...any) { f(msg, args...) }

// backendURL rewrites a 127.0.0.1 httptest URL to localhost so the
// production deny policy (which refuses literal loopback) lets the request
// through to the test dialer in tests using localDialer.
func backendURL(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	_, port, err := net.SplitHostPort(srv.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	return "http://localhost:" + port
}

func basicFor(token string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("oasm:"+token))
}

// startEgress starts a test server on 127.0.0.1 with the given auth. The
// dialer is overridden to reach a local httptest backend the production
// deny policy would otherwise refuse.
func startEgress(t *testing.T, auth AuthFunc, dial func(ctx context.Context, network, addr string) (net.Conn, error)) *Server {
	t.Helper()
	srv, err := NewServer("127.0.0.1:0", auth, Options{})
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	if dial != nil {
		srv.dial = dial
	}
	t.Cleanup(func() { _ = srv.Close() })
	go func() { _ = srv.Serve(t.Context()) }()
	return srv
}

// localDialer dials straight through (test-only): the httptest backends
// listen on 127.0.0.1, which production policy denies.
func localDialer() func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, addr)
	}
}

func TestHTTPForwardValidToken(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "hello-backend")
	}))
	t.Cleanup(backend.Close)

	var mu sync.Mutex
	var gotLog string
	srv := startEgress(t, testAuth("tok-http-1"), localDialer())
	srv.SetLogger(testLogger(func(format string, args ...any) {
		mu.Lock()
		defer mu.Unlock()
		gotLog += fmt.Sprintf(format, args...) + "\n"
	}))

	proxyURL, _ := url.Parse("http://oasm:tok-http-1@" + srv.Addr().String())
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get(backendURL(t, backend) + "/path")
	if err != nil {
		t.Fatalf("proxied GET: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "hello-backend" {
		t.Fatalf("body = %q, want %q", body, "hello-backend")
	}
	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(gotLog, "exec-test") {
		t.Fatalf("proxy log must carry the exec label, got:\n%s", gotLog)
	}
}

func TestHTTPMissingAuth407(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	t.Cleanup(backend.Close)
	srv := startEgress(t, testAuth("tok-x"), nil)

	conn, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "GET %s/ HTTP/1.1\r\nHost: x\r\n\r\n", backend.URL)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	head := make([]byte, 128)
	n, _ := conn.Read(head)
	if !strings.Contains(string(head[:n]), "407") {
		t.Fatalf("missing auth must yield 407, got %q", head[:n])
	}
}

func TestHTTPConnectBlockedTarget403(t *testing.T) {
	srv := startEgress(t, testAuth("tok-conn"), nil)
	conn, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "CONNECT 169.254.169.254:80 HTTP/1.1\r\nHost: 169.254.169.254:80\r\nProxy-Authorization: %s\r\n\r\n", basicFor("tok-conn"))
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	head := make([]byte, 128)
	n, _ := conn.Read(head)
	if !strings.Contains(string(head[:n]), "403") {
		t.Fatalf("blocked CONNECT must yield 403, got %q", head[:n])
	}
}

func TestHTTPResponseNeverLeaksToken(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if v := r.Header.Get("Proxy-Authorization"); v != "" {
			t.Errorf("backend saw Proxy-Authorization %q — must be stripped", v)
		}
		fmt.Fprint(w, "ok")
	}))
	t.Cleanup(backend.Close)
	srv := startEgress(t, testAuth("tok-leak"), localDialer())

	proxyURL, _ := url.Parse("http://tok-leak@" + srv.Addr().String())
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get(backendURL(t, backend) + "/")
	if err != nil {
		t.Fatalf("proxied GET: %v", err)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}
