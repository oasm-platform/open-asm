package worker

import (
	"net"
	"net/url"
	"strconv"
	"strings"

	"oasm-worker/internal/egress"
)

// agentProxy routes agent host shell commands through the worker egress
// proxy so their HTTP requests are attributed to the agent session. A nil
// *agentProxy (no egress server: disabled, no Docker, CLI mode) keeps the
// commands on direct egress.
type agentProxy struct {
	runs     *egress.RunCredentials
	port     int
	grpcHost string
}

// env returns the proxy variables for one command's token. No ALL_PROXY:
// run tokens are HTTP-only, the SOCKS half does not accept them.
func (p *agentProxy) env(token string) []string {
	if p == nil {
		return nil
	}
	// url.User escapes the token for the userinfo slot, as buildContainerEnv does.
	proxyURL := (&url.URL{Scheme: "http", User: url.User(token), Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(p.port))}).String()
	noProxy := []string{"localhost", "127.0.0.1", "::1"}
	if p.grpcHost != "" {
		noProxy = append(noProxy, p.grpcHost)
	}
	np := strings.Join(noProxy, ",")
	return []string{
		"HTTP_PROXY=" + proxyURL,
		"HTTPS_PROXY=" + proxyURL,
		"http_proxy=" + proxyURL,
		"https_proxy=" + proxyURL,
		"NO_PROXY=" + np,
		"no_proxy=" + np,
	}
}

// commandEnv builds a host command's env and, with the proxy active, issues
// its run token. revoke must be called once the command has exited.
func (p *agentProxy) commandEnv(toolPath, sessionID string) (env []string, revoke func()) {
	if p == nil {
		return setupCmdEnv(toolPath, false), func() {}
	}
	token, revoke := p.runs.Issue(sessionID)
	return append(setupCmdEnv(toolPath, true), p.env(token)...), revoke
}
