package egress

import (
	"net/netip"
	"strings"
)

// Prefixes copied from worker/internal/worker/browser_proxy.go
// (nonPublicPrefixes): special-purpose ranges that netip does not classify
// as private, loopback or link-local but that are not on the internet. Kept
// in sync manually — the egress proxy is the enforcement point for connector
// containers, the browser proxy for sandboxed browser sessions.
var nonPublicPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),      // "this network"
	netip.MustParsePrefix("100.64.0.0/10"),  // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),   // IETF protocol assignments
	netip.MustParsePrefix("198.18.0.0/15"),  // benchmarking
	netip.MustParsePrefix("240.0.0.0/4"),    // reserved
	netip.MustParsePrefix("::/96"),          // IPv4-compatible (deprecated)
	netip.MustParsePrefix("100::/64"),       // discard
	netip.MustParsePrefix("64:ff9b:1::/48"), // local-use NAT64
}

// metadataHosts are DNS names that always resolve to link-local/cloud
// metadata endpoints. Blocked by name because an attacker can reach them
// without ever dialing a literal IP.
var metadataHosts = []string{
	"metadata.google.internal",
	"instance-data",
}

// IsPublicAddr reports whether ip is a unicast address on the internet. An
// IPv4 address embedded by NAT64 or 6to4 is judged by that IPv4 address.
func IsPublicAddr(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return false
	}
	for _, pfx := range nonPublicPrefixes {
		if pfx.Contains(ip) {
			return false
		}
	}
	if ip.Is6() {
		b := ip.As16()
		switch {
		case netip.MustParsePrefix("64:ff9b::/96").Contains(ip):
			return IsPublicAddr(netip.AddrFrom4([4]byte(b[12:16])))
		case netip.MustParsePrefix("2002::/16").Contains(ip):
			return IsPublicAddr(netip.AddrFrom4([4]byte(b[2:6])))
		}
	}
	return true
}

// denyTarget reports whether an egress target host must be refused before
// dialing: explicit DenyHosts entries, cloud-metadata names, or literal
// non-public IPs. Plain domain names pass here — the dial path resolves and
// vets the actual IPs (resolve-then-check) so DNS rebinding cannot smuggle a
// private target through.
func denyTarget(host string, denyHosts []string) bool {
	h := strings.ToLower(strings.Trim(host, "[]"))
	for _, d := range denyHosts {
		if strings.EqualFold(h, strings.Trim(d, "[]")) {
			return true
		}
	}
	for _, m := range metadataHosts {
		if strings.EqualFold(h, m) {
			return true
		}
	}
	if ip, err := netip.ParseAddr(h); err == nil {
		return !IsPublicAddr(ip)
	}
	return false
}
