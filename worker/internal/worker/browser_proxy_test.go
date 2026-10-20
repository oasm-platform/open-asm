package worker

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
)

func TestScopeProxyAllowed(t *testing.T) {
	p := &scopeProxy{}
	p.allowHosts("Example.com", "*.corp.test")
	cases := map[string]bool{
		"example.com":         true,
		"example.com:8443":    true,
		"sub.example.com":     false,
		"a.corp.test:443":     true,
		"corp.test":           true,
		"evilcorp.test":       false,
		"169.254.169.254:80":  false,
		"[::1]:80":            false,
		"example.com.evil.io": false,
	}
	for in, want := range cases {
		if got := p.allowed(in); got != want {
			t.Errorf("allowed(%q) = %v, want %v", in, got, want)
		}
	}
}

func proxiedClient(t *testing.T, p *scopeProxy) *http.Client {
	t.Helper()
	pu, _ := url.Parse("http://" + p.addr())
	return &http.Client{Transport: &http.Transport{
		Proxy:           http.ProxyURL(pu),
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // httptest cert
	}}
}

func TestScopeProxyForwardsInScopeAndBlocksTheRest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "ok") }))
	defer srv.Close()
	tlsSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "tls-ok") }))
	defer tlsSrv.Close()

	var mu sync.Mutex
	var blocked []string
	p, err := newScopeProxy([]string{"127.0.0.1"}, func(l string) { mu.Lock(); blocked = append(blocked, l); mu.Unlock() })
	if err != nil {
		t.Fatal(err)
	}
	defer p.close()
	c := proxiedClient(t, p)

	for _, u := range []string{srv.URL, tlsSrv.URL} {
		resp, err := c.Get(u)
		if err != nil {
			t.Fatalf("GET %s: %v", u, err)
		}
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode != 200 || !strings.HasSuffix(string(body), "ok") {
			t.Fatalf("GET %s = %d %q", u, resp.StatusCode, body)
		}
	}

	// Same server, but "localhost" is not in scope: plain and TLS both refused.
	plain := strings.Replace(srv.URL, "127.0.0.1", "localhost", 1)
	if resp, err := c.Get(plain); err != nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("GET %s: want 403, got %v %v", plain, resp, err)
	}
	if _, err := c.Get(strings.Replace(tlsSrv.URL, "127.0.0.1", "localhost", 1)); err == nil {
		t.Fatal("CONNECT to an out-of-scope host must fail")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(blocked) != 2 || !strings.HasPrefix(blocked[0], "BLOCKED GET http://localhost:") || !strings.HasPrefix(blocked[1], "BLOCKED CONNECT localhost:") {
		t.Fatalf("blocked log = %q", blocked)
	}

	p.allowHosts("localhost")
	if resp, err := c.Get(plain); err != nil || resp.StatusCode != 200 {
		t.Fatalf("after allowHosts: %v %v", resp, err)
	}
}
