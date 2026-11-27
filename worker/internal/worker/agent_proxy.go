package worker

import (
	"context"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"oasm-worker/internal/egress"
	workers "oasm-worker/internal/gen/workers"
)

// agentProxy routes agent host shell commands through the worker egress
// proxy so their HTTP requests are attributed to the agent session. A nil
// *agentProxy (no egress server: disabled, no Docker, CLI mode) keeps the
// commands on direct egress.
type agentProxy struct {
	runs     *egress.RunCredentials
	port     int
	grpcHost string
	recorder *egress.Recorder
}

type egressLogReporter interface {
	ReportEgressHttpLogs(ctx context.Context, events []egress.HTTPEvent, dropped uint64) (*workers.EgressHttpLogAck, error)
}

// newEgressRecorder ships the proxy's request logs to core-api. Rejected rows
// are only logged: core-api rejects them for good (unknown session, wrong
// worker), so a resend would be rejected again.
func newEgressRecorder(client egressLogReporter, log egress.Logger) *egress.Recorder {
	return egress.NewRecorder(egress.RecorderOptions{
		Logger: log,
		Send: func(ctx context.Context, batch []egress.HTTPEvent, dropped uint64) error {
			ack, err := client.ReportEgressHttpLogs(ctx, batch, dropped)
			if err != nil {
				return err
			}
			if ack.GetRejected() > 0 {
				log.Warning("core-api rejected %d of %d agent http log rows", ack.GetRejected(), len(batch))
			}
			return nil
		},
	})
}

// flushWait bounds how long EXIT waits for a command's request logs: logging
// must never hold up the agent for long when core-api is slow or down.
const flushWait = 2 * time.Second

// flush waits until the session's recorded requests reached core-api. It is
// detached from the command ctx: a cancelled stream must not skip the wait
// that keeps EXIT behind the command's log rows.
func (p *agentProxy) flush(sessionID string) {
	if p == nil || p.recorder == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), flushWait)
	defer cancel()
	p.recorder.FlushSession(ctx, sessionID)
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
