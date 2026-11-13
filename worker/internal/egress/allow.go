package egress

import (
	"fmt"
	"net/netip"
	"strings"
)

// NonPublicPrefixes lists special-purpose ranges that netip does not
// classify as private, loopback or link-local but that are not on the
// internet. Single source of truth for both proxies: the egress proxy (this
// package, the enforcement point for connector containers) and the browser
// proxy (worker/internal/worker, sandboxed browser sessions) both call
// IsPublicAddr below.
var NonPublicPrefixes = []netip.Prefix{
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
	for _, pfx := range NonPublicPrefixes {
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
func denyTarget(host string, denyHosts []string, allow []netip.Prefix) bool {
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
		return !allowedAddr(ip, allow)
	}
	return false
}

// allowedAddr reports whether ip may be dialed: any public address, plus
// non-public addresses the worker operator listed (WORKER_EGRESS_ALLOW), e.g.
// an on-prem Nessus or Acunetix on a private IP.
func allowedAddr(ip netip.Addr, allow []netip.Prefix) bool {
	if IsPublicAddr(ip) {
		return true
	}
	ip = ip.Unmap()
	for _, p := range allow {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// ParseAllow parses a comma-separated list of IPs and CIDRs (a bare IP means
// that single address). Hostnames are rejected: names are vetted by the IP
// they resolve to, so list the IP or range instead.
func ParseAllow(list string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, f := range strings.Split(list, ",") {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		if p, err := netip.ParsePrefix(f); err == nil {
			out = append(out, p.Masked())
			continue
		}
		ip, err := netip.ParseAddr(f)
		if err != nil {
			return nil, fmt.Errorf("egress allow %q: want an IP or CIDR", f)
		}
		ip = ip.Unmap()
		out = append(out, netip.PrefixFrom(ip, ip.BitLen()))
	}
	return out, nil
}
