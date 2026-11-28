package egress

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestMaskHeadersVendorCredentials(t *testing.T) {
	for _, name := range []string{"X-Auth-Key", "Ocp-Apim-Subscription-Key", "X-Access-Key", "X-Auth-Email", "Authentication", "X-Amz-Credential", "X-Session-Id"} {
		got := MaskHeaders(http.Header{name: {"v"}})
		if got[0].Value != masked {
			t.Errorf("%s = %q, want masked", name, got[0].Value)
		}
	}
	if got := MaskHeaders(http.Header{"Accept": {"v"}}); got[0].Value != "v" {
		t.Errorf("Accept must stay readable, got %q", got[0].Value)
	}
}

func TestMaskBody(t *testing.T) {
	cases := []struct{ ct, in, want string }{
		{"application/x-www-form-urlencoded", "user=a&password=hunter2&x=1", "user=a&password=***&x=1"},
		// Cut at BodyCap mid-pair: what is there is still masked.
		{"application/x-www-form-urlencoded; charset=utf-8", "user=a&pass", "user=a&pass"},
		{"application/json", `{"access_token":"t","ok":1,"n":{"refresh_token":"r"},"l":[{"api_key":"k"}],"id":12345678901234567890}`,
			`{"access_token":"***","id":12345678901234567890,"l":[{"api_key":"***"}],"n":{"refresh_token":"***"},"ok":1}`},
		{"application/vnd.api+json", `{"password":"p"}`, `{"password":"***"}`},
		// Unchanged JSON keeps its exact bytes.
		{"application/json", `{ "b":1, "a":2 }`, `{ "b":1, "a":2 }`},
		// Truncated JSON does not parse: kept as is.
		{"application/json", `{"access_token":"t","x":`, `{"access_token":"t","x":`},
		{"text/plain", "password=x", "password=x"},
	}
	for _, c := range cases {
		if got := string(MaskBody(c.ct, []byte(c.in))); got != c.want {
			t.Errorf("MaskBody(%q, %q) = %q, want %q", c.ct, c.in, got, c.want)
		}
	}
}

func TestForwardMasksBodiesAndLocation(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Location", "/cb?code=abc&state=z")
		w.WriteHeader(http.StatusFound)
		fmt.Fprint(w, `{"access_token":"t"}`)
	}))
	t.Cleanup(backend.Close)
	srv, runs, sink := startRunEgress(t, Options{})
	tok, revoke := runs.Issue("sess-mask")
	defer revoke()

	client := proxyClient(srv, tok)
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Post(backendURL(t, backend)+"/login", "application/x-www-form-urlencoded", strings.NewReader("user=a&password=hunter2"))
	if err != nil {
		t.Fatalf("proxied POST: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.Header.Get("Location") != "/cb?code=abc&state=z" {
		t.Fatalf("client must get the real Location, got %q", resp.Header.Get("Location"))
	}

	e := sink.next(t)
	if string(e.RequestBody) != "user=a&password=***" {
		t.Fatalf("request body = %q", e.RequestBody)
	}
	if string(e.ResponseBody) != `{"access_token":"***"}` {
		t.Fatalf("response body = %q", e.ResponseBody)
	}
	if v := headerValue(e.ResponseHeaders, "Location"); v != "/cb?code=***&state=z" {
		t.Fatalf("Location = %q", v)
	}
}

// A client that hangs up mid-body is a cancelled request, not a success.
func TestForwardClientAbortIsCancelled(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chunk := make([]byte, 32*1024)
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if _, err := w.Write(chunk); err != nil {
				return
			}
		}
	}))
	t.Cleanup(backend.Close)
	srv, runs, sink := startRunEgress(t, Options{})
	tok, revoke := runs.Issue("sess-abort")
	defer revoke()

	c, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	fmt.Fprintf(c, "GET %s/ HTTP/1.1\r\nHost: x\r\nProxy-Authorization: %s\r\n\r\n", backendURL(t, backend), basicFor(tok))
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	if _, err := io.ReadFull(c, make([]byte, 1024)); err != nil {
		t.Fatalf("read: %v", err)
	}
	c.Close()

	e := sink.next(t)
	if e.Outcome != OutcomeCancelled || e.Error == "" {
		t.Fatalf("outcome = %v error = %q, want cancelled", e.Outcome, e.Error)
	}
}

// startRecordedTunnelEgress is startRunEgress plus a Recorder whose batches
// are kept, so a test can check what FlushRun saw delivered.
func startRecordedTunnelEgress(t *testing.T) (*Server, *RunCredentials, *Recorder, chan HTTPEvent) {
	t.Helper()
	sent := make(chan HTTPEvent, 16)
	rec := NewRecorder(RecorderOptions{
		Interval: time.Hour,
		Send: func(_ context.Context, batch []HTTPEvent, _ uint64) error {
			for _, e := range batch {
				sent <- e
			}
			return nil
		},
	})
	go rec.Run(t.Context())
	runs := NewRunCredentials()
	srv, err := NewServer("127.0.0.1:0", testAuth(""), Options{Runs: runs, Recorder: rec})
	if err != nil {
		t.Fatal(err)
	}
	srv.dial = localDialer()
	t.Cleanup(func() { _ = srv.Close() })
	go func() { _ = srv.Serve(t.Context()) }()
	return srv, runs, rec, sent
}

// An HTTPS request through CONNECT must be delivered before FlushRun
// returns: the tunnel ends when the client is done (not when the server
// idles out), and the event counts as pending while it is still open.
func TestFlushRunWaitsForTunnelEvent(t *testing.T) {
	backend := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "tls-ok")
	}))
	t.Cleanup(backend.Close)
	srv, runs, rec, sent := startRecordedTunnelEgress(t)
	tok, revoke := runs.Issue("sess-tls")
	defer revoke()
	run, _ := runs.Lookup(tok)

	_, port, _ := net.SplitHostPort(backend.Listener.Addr().String())
	proxyURL := &url.URL{Scheme: "http", User: url.User(tok), Host: srv.Addr().String()}
	// Keep-alive, so the server holds the conn open after the response
	// (as real servers do) and only the client's close can end the tunnel.
	tr := &http.Transport{
		Proxy:           http.ProxyURL(proxyURL),
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{Transport: tr}
	resp, err := client.Get("https://localhost:" + port + "/")
	if err != nil {
		t.Fatalf("proxied HTTPS GET: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "tls-ok" {
		t.Fatalf("body = %q", body)
	}
	tr.CloseIdleConnections()

	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	rec.FlushRun(ctx, run.ID)
	if ctx.Err() != nil {
		t.Fatal("FlushRun hit its deadline: the tunnel outlived the client")
	}
	select {
	case e := <-sent:
		if e.Scheme != "https" || e.RunID != run.ID || e.SessionID != "sess-tls" {
			t.Fatalf("event = %+v", e)
		}
	default:
		t.Fatal("FlushRun returned before the tunnel event was delivered")
	}
}

// silentTarget accepts TCP conns and closes each only once the peer's EOF
// arrives, like a server idling on a keep-alive conn.
func silentTarget(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() { _, _ = io.Copy(io.Discard, c); c.Close() }()
		}
	}()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	return port
}

func openTunnel(t *testing.T, srv *Server, port, tok string) (net.Conn, *bufio.Reader) {
	t.Helper()
	c, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	fmt.Fprintf(c, "CONNECT localhost:%s HTTP/1.1\r\nHost: localhost:%s\r\nProxy-Authorization: %s\r\n\r\n", port, port, basicFor(tok))
	br := bufio.NewReader(c)
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	resp, err := http.ReadResponse(br, &http.Request{Method: "CONNECT"})
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("CONNECT: %v %v", resp, err)
	}
	return c, br
}

// A client closing without a protocol-level goodbye (no TLS close_notify)
// must still end the tunnel: its EOF has to reach the server.
func TestTunnelEndsWhenClientCloses(t *testing.T) {
	port := silentTarget(t)
	srv, runs, rec, sent := startRecordedTunnelEgress(t)
	tok, revoke := runs.Issue("sess-eof")
	defer revoke()
	run, _ := runs.Lookup(tok)

	c, _ := openTunnel(t, srv, port, tok)
	c.Write([]byte("ping"))
	c.Close()

	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	rec.FlushRun(ctx, run.ID)
	if ctx.Err() != nil {
		t.Fatal("FlushRun hit its deadline: the tunnel outlived the client")
	}
	select {
	case e := <-sent:
		if e.RunID != run.ID || e.RequestBytes != 4 {
			t.Fatalf("event = %+v", e)
		}
	default:
		t.Fatal("FlushRun returned before the tunnel event was delivered")
	}
}

// Revoking a run cuts tunnels opened with its token: a backgrounded child
// must not keep egress after the command exited.
func TestRevokeClosesOpenTunnel(t *testing.T) {
	port := silentTarget(t)
	srv, runs, rec, sent := startRecordedTunnelEgress(t)
	tok, revoke := runs.Issue("sess-bg")
	run, _ := runs.Lookup(tok)

	c, br := openTunnel(t, srv, port, tok)

	revoke()
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := br.ReadByte(); err != io.EOF {
		t.Fatalf("tunnel read after revoke = %v, want EOF", err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	rec.FlushRun(ctx, run.ID)
	select {
	case e := <-sent:
		if e.RunID != run.ID {
			t.Fatalf("event = %+v", e)
		}
	default:
		t.Fatal("the cut tunnel's event must still be recorded")
	}
}
