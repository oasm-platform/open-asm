package egress

import (
	"context"
	"errors"
	"net"
	"testing"
)

func TestParseAllow(t *testing.T) {
	got, err := ParseAllow(" 10.0.5.20 , 192.168.10.7/24,,fd00::1 ")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"10.0.5.20/32", "192.168.10.0/24", "fd00::1/128"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i].String() != want[i] {
			t.Errorf("[%d] = %s, want %s", i, got[i], want[i])
		}
	}
	if p, err := ParseAllow(""); err != nil || p != nil {
		t.Fatalf("empty: %v %v", p, err)
	}
	if _, err := ParseAllow("nessus.corp.local"); err == nil {
		t.Fatal("hostnames must be rejected")
	}
}

// An allowed private IP passes; neighbours, explicit deny hosts and metadata
// names stay blocked.
func TestDenyTargetAllowlist(t *testing.T) {
	allow, _ := ParseAllow("10.0.5.20")
	if denyTarget("10.0.5.20", nil, allow) {
		t.Fatal("allowed private IP must pass")
	}
	if !denyTarget("10.0.5.21", nil, allow) {
		t.Fatal("unlisted private IP must stay blocked")
	}
	if !denyTarget("10.0.5.20", []string{"10.0.5.20"}, allow) {
		t.Fatal("explicit deny host must win over allow")
	}
	all, _ := ParseAllow("169.254.0.0/16")
	if !denyTarget("metadata.google.internal", nil, all) {
		t.Fatal("metadata names stay blocked")
	}
}

// An internal name resolving to an allowed private IP is dialed (on-prem
// Nessus behind internal DNS); without the allowlist it is refused.
func TestDialVettedAllowsListedPrivateIP(t *testing.T) {
	for _, tc := range []struct {
		allow string
		dial  bool
	}{{"10.0.5.0/24", true}, {"", false}} {
		allow, _ := ParseAllow(tc.allow)
		s := &Server{allow: allow, dialTO: 1}
		s.lookup = func(context.Context, string) ([]string, error) { return []string{"10.0.5.20"}, nil }
		var dialed string
		s.dialIP = func(_ context.Context, _, addr string) (net.Conn, error) {
			dialed = addr
			return nil, errors.New("stop")
		}
		_, err := s.dialVetted(context.Background(), "tcp", "nessus.corp.local:8834")
		var be *blockedError
		if tc.dial && dialed != "10.0.5.20:8834" {
			t.Fatalf("allow %q: dialed %q, want 10.0.5.20:8834", tc.allow, dialed)
		}
		if !tc.dial && (dialed != "" || !errors.As(err, &be)) {
			t.Fatalf("no allow: dialed %q err %v, want blocked", dialed, err)
		}
	}
}
