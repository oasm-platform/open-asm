package worker

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func proxiedClient(t *testing.T, p *publicProxy) *http.Client {
	t.Helper()
	pu, _ := url.Parse("http://" + p.addr())
	return &http.Client{Transport: &http.Transport{
		Proxy:           http.ProxyURL(pu),
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // httptest cert
	}}
}

func TestPublicProxyForwardsPlainAndTLS(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "ok") }))
	defer srv.Close()
	tlsSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "tls-ok") }))
	defer tlsSrv.Close()

	p, err := newPublicProxy(nil)
	if err != nil {
		t.Fatal(err)
	}
	defer p.close()
	p.dialable = func(netip.Addr) bool { return true } // the test servers are on loopback
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
}

func TestPublicProxyRefusesLocalAddresses(t *testing.T) {
	var hit atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { hit.Store(true) }))
	defer srv.Close()
	tlsSrv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { hit.Store(true) }))
	defer tlsSrv.Close()

	var mu sync.Mutex
	var blocked []string
	p, err := newPublicProxy(func(l string) { mu.Lock(); blocked = append(blocked, l); mu.Unlock() })
	if err != nil {
		t.Fatal(err)
	}
	defer p.close()
	c := proxiedClient(t, p)

	// By name too: "localhost" is only known to resolve to loopback once dialed.
	plain := strings.Replace(srv.URL, "127.0.0.1", "localhost", 1)
	resp, err := c.Get(plain)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("GET %s = %d, want 403", plain, resp.StatusCode)
	}
	if _, err := c.Get(tlsSrv.URL); err == nil {
		t.Fatal("CONNECT to loopback must fail")
	}
	mu.Lock()
	defer mu.Unlock()
	if hit.Load() {
		t.Fatal("a local server was reached")
	}
	want := "is not a public address (this worker is shared)"
	if len(blocked) != 2 || !strings.HasPrefix(blocked[0], "BLOCKED GET http://localhost:") || !strings.HasPrefix(blocked[1], "BLOCKED CONNECT 127.0.0.1:") || !strings.Contains(blocked[0], want) || !strings.Contains(blocked[1], want) {
		t.Fatalf("blocked log = %q", blocked)
	}
}

func TestIsPublicAddr(t *testing.T) {
	cases := map[string]bool{
		"8.8.8.8":          true,
		"2606:4700::1111":  true,
		"64:ff9b::808:808": true, // NAT64 of 8.8.8.8
		"2002:808:808::1":  true, // 6to4 of 8.8.8.8
		"10.0.0.1":         false,
		"172.16.5.4":       false,
		"192.168.1.1":      false,
		"100.64.0.1":       false,
		"127.0.0.1":        false,
		"169.254.169.254":  false,
		"0.1.2.3":          false,
		"198.18.0.1":       false,
		"255.255.255.255":  false,
		"::1":              false,
		"fe80::1":          false,
		"fd00::1":          false,
		"::ffff:10.0.0.1":  false,
		"64:ff9b::a00:1":   false, // NAT64 of 10.0.0.1
		"2002:a00:1::1":    false, // 6to4 of 10.0.0.1
		"64:ff9b:1::a00:1": false,
	}
	for in, want := range cases {
		if got := isPublicAddr(netip.MustParseAddr(in)); got != want {
			t.Errorf("isPublicAddr(%s) = %v, want %v", in, got, want)
		}
	}
}

func TestSharedWorkerHostErr(t *testing.T) {
	for host, refused := range map[string]bool{
		"example.com": false, "8.8.8.8": false, "localhost": true, "app.localhost": true,
		"127.0.0.1": true, "10.0.0.8": true, "[::1]": true, "169.254.169.254": true,
	} {
		if err := sharedWorkerHostErr(host); (err != nil) != refused {
			t.Errorf("sharedWorkerHostErr(%s) = %v, want refused=%v", host, err, refused)
		}
	}
}
