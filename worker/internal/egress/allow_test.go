package egress

import (
	"net/netip"
	"testing"
)

func TestIsPublicAddrDenies(t *testing.T) {
	denied := []string{
		"127.0.0.1", "::1",
		"10.0.0.5", "172.16.9.9", "192.168.1.20",
		"169.254.169.254", "169.254.10.20",
		"0.0.0.5", "100.64.0.9",
		"fc00::1", "fe80::1",
		"::ffff:10.0.0.1", // NAT64/6to4-embedded private IPv4
	}
	for _, s := range denied {
		ip := netip.MustParseAddr(s)
		if IsPublicAddr(ip) {
			t.Errorf("IsPublicAddr(%s) = true, want false", s)
		}
	}
}

func TestIsPublicAddrAllows(t *testing.T) {
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"} {
		ip := netip.MustParseAddr(s)
		if !IsPublicAddr(ip) {
			t.Errorf("IsPublicAddr(%s) = false, want true", s)
		}
	}
}

func TestDenyTargetMetadata(t *testing.T) {
	for _, h := range []string{
		"metadata.google.internal", "instance-data",
		"169.254.169.254",
	} {
		if !denyTarget(h, nil) {
			t.Errorf("denyTarget(%q) = false, want true", h)
		}
	}
	if denyTarget("example.com", nil) {
		t.Error("denyTarget(example.com) = true, want false (literal-only; dial path vets resolved IPs)")
	}
	if !denyTarget("internal.corp", []string{"internal.corp"}) {
		t.Error("denyTarget with explicit DenyHosts entry must deny")
	}
}
