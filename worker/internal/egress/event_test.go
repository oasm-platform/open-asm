package egress

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestNewEventIDIsUUIDv7(t *testing.T) {
	re := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	a := NewEventID()
	time.Sleep(2 * time.Millisecond)
	b := NewEventID()
	for _, id := range []string{a, b} {
		if !re.MatchString(id) {
			t.Fatalf("id %q is not a UUIDv7", id)
		}
	}
	if !(a < b) {
		t.Fatalf("ids must sort by time: %q !< %q", a, b)
	}
}

func TestMaskHeaders(t *testing.T) {
	h := http.Header{}
	h.Set("Authorization", "Bearer s3cret")
	h.Set("Cookie", "sid=1")
	h.Add("Set-Cookie", "a=1")
	h.Add("Set-Cookie", "b=2")
	h.Set("X-Api-Key", "k")
	h.Set("X-Auth-Token", "t")
	h.Set("Content-Type", "application/json")
	h.Add("Accept", "text/html")
	h.Add("Accept", "application/json")

	got := MaskHeaders(h)
	want := []Header{
		{"Accept", "text/html"},
		{"Accept", "application/json"},
		{"Authorization", "***"},
		{"Content-Type", "application/json"},
		{"Cookie", "***"},
		{"Set-Cookie", "***"},
		{"Set-Cookie", "***"},
		{"X-Api-Key", "***"},
		{"X-Auth-Token", "***"},
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("MaskHeaders = %v\nwant %v", got, want)
	}
}

func TestMaskQuery(t *testing.T) {
	cases := map[string]string{
		"/a?token=x&q=1":           "/a?token=***&q=1",
		"/a":                       "/a",
		"/a?":                      "/a?",
		"/a?API_KEY=1&flag":        "/a?API_KEY=***&flag",
		"/cb?code=abc&state=z&x=1": "/cb?code=***&state=z&x=1",
	}
	for in, want := range cases {
		if got := MaskQuery(in); got != want {
			t.Errorf("MaskQuery(%q) = %q, want %q", in, got, want)
		}
	}
}

// eventSink is a running Recorder whose batches land on a channel.
type eventSink struct {
	rec *Recorder
	ch  chan HTTPEvent
}

func newEventSink(t *testing.T) *eventSink {
	t.Helper()
	s := &eventSink{ch: make(chan HTTPEvent, 64)}
	s.rec = NewRecorder(RecorderOptions{
		Interval: 10 * time.Millisecond,
		Send: func(_ context.Context, batch []HTTPEvent, _ uint64) error {
			for _, e := range batch {
				s.ch <- e
			}
			return nil
		},
	})
	go s.rec.Run(t.Context())
	return s
}

func (s *eventSink) next(t *testing.T) HTTPEvent {
	t.Helper()
	select {
	case e := <-s.ch:
		return e
	case <-time.After(5 * time.Second):
		t.Fatal("no event recorded")
		return HTTPEvent{}
	}
}

func (s *eventSink) none(t *testing.T) {
	t.Helper()
	select {
	case e := <-s.ch:
		t.Fatalf("unexpected event %+v", e)
	case <-time.After(100 * time.Millisecond):
	}
}

// startRunEgress starts a proxy that accepts run tokens and records into a
// sink; the connector token "conn-tok" authenticates through AuthFunc.
func startRunEgress(t *testing.T, opts Options) (*Server, *RunCredentials, *eventSink) {
	t.Helper()
	runs := NewRunCredentials()
	sink := newEventSink(t)
	opts.Runs = runs
	opts.Recorder = sink.rec
	srv, err := NewServer("127.0.0.1:0", testAuth("conn-tok"), opts)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	srv.dial = localDialer()
	t.Cleanup(func() { _ = srv.Close() })
	go func() { _ = srv.Serve(t.Context()) }()
	return srv, runs, sink
}

func proxyClient(srv *Server, token string) *http.Client {
	proxyURL := &url.URL{Scheme: "http", User: url.User(token), Host: srv.Addr().String()}
	return &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL), DisableKeepAlives: true}}
}

func TestForwardRecordsEvent(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Set-Cookie", "sid=secret")
		w.Header().Set("X-Reply", "yes")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, "got:%s", body)
	}))
	t.Cleanup(backend.Close)
	srv, runs, sink := startRunEgress(t, Options{})
	tok, revoke := runs.Issue("sess-fwd")
	defer revoke()

	target := backendURL(t, backend) + "/items?token=abc&q=1"
	req, _ := http.NewRequest(http.MethodPost, target, strings.NewReader("hello"))
	req.Header.Set("Authorization", "Bearer abc")
	req.Header.Set("Content-Type", "text/plain")
	resp, err := proxyClient(srv, tok).Do(req)
	if err != nil {
		t.Fatalf("proxied POST: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated || string(body) != "got:hello" {
		t.Fatalf("status=%d body=%q", resp.StatusCode, body)
	}

	e := sink.next(t)
	_, port, _ := net.SplitHostPort(backend.Listener.Addr().String())
	wantPort, _ := strconv.Atoi(port)
	if e.SessionID != "sess-fwd" || e.ID == "" || e.Scheme != "http" || e.Method != http.MethodPost ||
		e.Host != "localhost" || e.Port != uint32(wantPort) || e.Path != "/items?token=***&q=1" {
		t.Fatalf("event identity fields wrong: %+v", e)
	}
	if e.StatusCode != 201 || e.Outcome != OutcomeAllowed || e.Error != "" {
		t.Fatalf("status/outcome wrong: %+v", e)
	}
	if string(e.RequestBody) != "hello" || string(e.ResponseBody) != "got:hello" ||
		e.RequestBytes != 5 || e.ResponseBytes != 9 || e.RequestBodyTruncated || e.ResponseBodyTruncated {
		t.Fatalf("bodies/bytes wrong: %+v", e)
	}
	if e.CompletedAt.Before(e.SentAt) || e.SentAt.IsZero() {
		t.Fatalf("times wrong: sent=%v completed=%v", e.SentAt, e.CompletedAt)
	}
	if v := headerValue(e.RequestHeaders, "Authorization"); v != "***" {
		t.Fatalf("request Authorization = %q, want ***", v)
	}
	if v := headerValue(e.RequestHeaders, "Content-Type"); v != "text/plain" {
		t.Fatalf("request Content-Type = %q", v)
	}
	if v := headerValue(e.RequestHeaders, "Proxy-Authorization"); v != "" {
		t.Fatalf("proxy credential must not be recorded, got %q", v)
	}
	if v := headerValue(e.ResponseHeaders, "Set-Cookie"); v != "***" {
		t.Fatalf("response Set-Cookie = %q, want ***", v)
	}
	if v := headerValue(e.ResponseHeaders, "X-Reply"); v != "yes" {
		t.Fatalf("response X-Reply = %q", v)
	}
}

func headerValue(hs []Header, name string) string {
	for _, h := range hs {
		if h.Name == name {
			return h.Value
		}
	}
	return ""
}

func TestForwardBodyCap(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n, _ := io.Copy(io.Discard, r.Body)
		_, _ = w.Write(bytes.Repeat([]byte("r"), int(n)))
	}))
	t.Cleanup(backend.Close)
	srv, runs, sink := startRunEgress(t, Options{})
	tok, revoke := runs.Issue("sess-cap")
	defer revoke()

	for _, tc := range []struct {
		size      int
		truncated bool
	}{{BodyCap + 1, true}, {BodyCap, false}} {
		resp, err := proxyClient(srv, tok).Post(backendURL(t, backend)+"/", "application/octet-stream",
			bytes.NewReader(bytes.Repeat([]byte("q"), tc.size)))
		if err != nil {
			t.Fatalf("proxied POST: %v", err)
		}
		n, _ := io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if n != int64(tc.size) {
			t.Fatalf("client got %d bytes, want %d", n, tc.size)
		}
		e := sink.next(t)
		if len(e.RequestBody) != BodyCap || len(e.ResponseBody) != BodyCap {
			t.Fatalf("size %d: stored bodies %d/%d, want %d", tc.size, len(e.RequestBody), len(e.ResponseBody), BodyCap)
		}
		if e.RequestBodyTruncated != tc.truncated || e.ResponseBodyTruncated != tc.truncated {
			t.Fatalf("size %d: truncated %v/%v, want %v", tc.size, e.RequestBodyTruncated, e.ResponseBodyTruncated, tc.truncated)
		}
		if e.RequestBytes != uint64(tc.size) || e.ResponseBytes != uint64(tc.size) {
			t.Fatalf("size %d: bytes %d/%d", tc.size, e.RequestBytes, e.ResponseBytes)
		}
	}
}

func TestTunnelRecordsEvent(t *testing.T) {
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
			go func() {
				defer c.Close()
				b := make([]byte, 64)
				n, _ := c.Read(b)
				c.Write([]byte("echo:" + string(b[:n])))
			}()
		}
	}()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	srv, runs, sink := startRunEgress(t, Options{})
	tok, revoke := runs.Issue("sess-tun")
	defer revoke()

	c, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	fmt.Fprintf(c, "CONNECT LocalHost:%s HTTP/1.1\r\nHost: LocalHost:%s\r\nProxy-Authorization: %s\r\n\r\n", port, port, basicFor(tok))
	br := bufio.NewReader(c)
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	resp, err := http.ReadResponse(br, &http.Request{Method: "CONNECT"})
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("CONNECT: %v %v", resp, err)
	}
	c.Write([]byte("ping"))
	_, _ = io.ReadAll(br)

	e := sink.next(t)
	wantPort, _ := strconv.Atoi(port)
	if e.SessionID != "sess-tun" || e.Scheme != "https" || e.Method != "" || e.Path != "" ||
		e.Host != "localhost" || e.Port != uint32(wantPort) || e.StatusCode != 0 || e.Outcome != OutcomeAllowed {
		t.Fatalf("tunnel event wrong: %+v", e)
	}
	if e.RequestBytes == 0 || e.ResponseBytes == 0 {
		t.Fatalf("tunnel bytes up/down must be > 0: %+v", e)
	}
}

func TestDeniedRecordsEvent(t *testing.T) {
	srv, runs, sink := startRunEgress(t, Options{DenyHosts: []string{"blocked.example"}})
	tok, revoke := runs.Issue("sess-deny")
	defer revoke()

	resp, err := proxyClient(srv, tok).Get("http://blocked.example/x")
	if err != nil {
		t.Fatalf("proxied GET: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", resp.StatusCode)
	}
	e := sink.next(t)
	if e.SessionID != "sess-deny" || e.Outcome != OutcomeDenied || e.Error != "policy" || e.Host != "blocked.example" || e.Port != 80 {
		t.Fatalf("denied event wrong: %+v", e)
	}

	c, err := net.Dial("tcp", srv.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	fmt.Fprintf(c, "CONNECT blocked.example:443 HTTP/1.1\r\nHost: blocked.example:443\r\nProxy-Authorization: %s\r\n\r\n", basicFor(tok))
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, _ = io.ReadAll(c)
	e = sink.next(t)
	if e.Outcome != OutcomeDenied || e.Scheme != "https" || e.Port != 443 {
		t.Fatalf("denied CONNECT event wrong: %+v", e)
	}
}

func TestUpstreamErrorRecordsEvent(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	ln.Close()
	srv, runs, sink := startRunEgress(t, Options{})
	tok, revoke := runs.Issue("sess-err")
	defer revoke()

	resp, err := proxyClient(srv, tok).Get("http://localhost:" + port + "/")
	if err != nil {
		t.Fatalf("proxied GET: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", resp.StatusCode)
	}
	e := sink.next(t)
	if e.Outcome != OutcomeUpstreamError || e.Error == "" || e.SessionID != "sess-err" {
		t.Fatalf("upstream error event wrong: %+v", e)
	}
}

func TestConnectorTokenDoesNotRecord(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	}))
	t.Cleanup(backend.Close)
	srv, _, sink := startRunEgress(t, Options{})

	resp, err := proxyClient(srv, "conn-tok").Get(backendURL(t, backend) + "/")
	if err != nil {
		t.Fatalf("proxied GET: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	// Failed auth has no identity, so it is not recorded either.
	resp, err = proxyClient(srv, "bogus").Get(backendURL(t, backend) + "/")
	if err != nil {
		t.Fatalf("proxied GET: %v", err)
	}
	resp.Body.Close()
	sink.none(t)
}
