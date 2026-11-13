// Package dnsresolver makes built-in naabu resolve names through the DNS the
// worker's host actually uses.
//
// naabu ignores /etc/resolv.conf: without -r it only queries a hard-coded list
// of public resolvers (1.1.1.1, 8.8.8.8, ...). On a network that blocks or
// intercepts outbound DNS to them every host looks unresolvable and the port
// scan silently finds nothing. Only the worker knows its network, so it pins
// naabu to its own resolvers before running a Core command.
//
// dnsx (discovery) is deliberately left alone: public resolvers return the SOA
// of an NXDOMAIN answer, which is how passive-source names are recorded as
// assets, and Docker's embedded DNS strips it.
package dnsresolver

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/netip"
	"os"
	"regexp"
	"strconv"
	"strings"
)

// ResolvConfPath is where the system resolvers are read from (Linux/macOS,
// and every containerised worker).
const ResolvConfPath = "/etc/resolv.conf"

// Off is the WORKER_DNS_RESOLVERS value that keeps the tools' own resolvers.
const Off = "off"

// Resolve returns the resolvers the built-in tools must use, as "ip:port".
// A non-empty override (WORKER_DNS_RESOLVERS) wins; "off" disables pinning.
// Otherwise the nameservers of resolvConf are used. nil means "leave the
// tools' defaults alone".
func Resolve(override string, resolvConf io.Reader) ([]string, error) {
	override = strings.TrimSpace(override)
	if strings.EqualFold(override, Off) {
		return nil, nil
	}
	if override != "" {
		return ParseOverride(override)
	}
	if resolvConf == nil {
		return nil, nil
	}
	resolvers := ParseResolvConf(resolvConf)
	if len(resolvers) == 0 {
		return nil, nil
	}
	return resolvers, nil
}

// Load is Resolve against the host's ResolvConfPath; a missing file (Windows)
// just means there is nothing to pin to.
func Load(override string) ([]string, error) {
	f, err := os.Open(ResolvConfPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Resolve(override, nil)
		}
		return nil, fmt.Errorf("read %s: %w", ResolvConfPath, err)
	}
	defer f.Close()
	return Resolve(override, f)
}

// ParseOverride parses a comma-separated list of resolver IPs, each with an
// optional port. Anything that is not an IP literal is rejected: the value
// ends up on a shell command line, so only digits, dots, colons and brackets
// may reach it.
func ParseOverride(s string) ([]string, error) {
	var resolvers []string
	for _, entry := range strings.Split(s, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		resolver, err := parseResolver(entry)
		if err != nil {
			return nil, err
		}
		resolvers = append(resolvers, resolver)
	}
	if len(resolvers) == 0 {
		return nil, errors.New("no resolver in list")
	}
	return resolvers, nil
}

func parseResolver(entry string) (string, error) {
	if addr, err := netip.ParseAddr(entry); err == nil && addr.Zone() == "" {
		return net.JoinHostPort(addr.String(), "53"), nil
	}
	host, port, err := net.SplitHostPort(entry)
	if err != nil {
		return "", fmt.Errorf("resolver %q: not an IP or IP:port", entry)
	}
	addr, err := netip.ParseAddr(host)
	if err != nil || addr.Zone() != "" {
		return "", fmt.Errorf("resolver %q: %q is not an IP address", entry, host)
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("resolver %q: invalid port %q", entry, port)
	}
	return net.JoinHostPort(addr.String(), strconv.Itoa(n)), nil
}

// ParseResolvConf returns the unique nameserver IPs of a resolv.conf as
// "ip:53", in file order. Zoned (link-local) addresses are skipped: the tools
// cannot dial them.
func ParseResolvConf(r io.Reader) []string {
	var resolvers []string
	seen := map[string]bool{}
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 || fields[0] != "nameserver" {
			continue
		}
		addr, err := netip.ParseAddr(fields[1])
		if err != nil || addr.Zone() != "" {
			continue
		}
		resolver := net.JoinHostPort(addr.String(), "53")
		if !seen[resolver] {
			seen[resolver] = true
			resolvers = append(resolvers, resolver)
		}
	}
	return resolvers
}

// pinnedTools matches an invocation of a pinned tool: the tool name in command
// position (start of the command or after a shell operator).
var pinnedTools = regexp.MustCompile(`(?:^|[|&;(])\s*(naabu)(?:\s|$)`)

// explicitResolvers matches a -r flag already present in a command segment.
var explicitResolvers = regexp.MustCompile(`(?:^|\s)-r(?:\s|=|$)`)

// segmentEnd marks where a single command of a shell pipeline ends.
const segmentEnd = "|&;)"

// ApplyToCommand inserts "-r <resolvers>" right after every naabu invocation in a shell command, unless that invocation already sets -r.
// With no resolvers the command is returned unchanged.
func ApplyToCommand(cmd string, resolvers []string) string {
	if len(resolvers) == 0 {
		return cmd
	}
	flag := " -r " + strings.Join(resolvers, ",")

	var out strings.Builder
	last := 0
	for _, m := range pinnedTools.FindAllStringSubmatchIndex(cmd, -1) {
		nameEnd := m[3]
		segment := cmd[nameEnd:]
		if i := strings.IndexAny(segment, segmentEnd); i >= 0 {
			segment = segment[:i]
		}
		if explicitResolvers.MatchString(segment) {
			continue
		}
		out.WriteString(cmd[last:nameEnd])
		out.WriteString(flag)
		last = nameEnd
	}
	out.WriteString(cmd[last:])
	return out.String()
}
