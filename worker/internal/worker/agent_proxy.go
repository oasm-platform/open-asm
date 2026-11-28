package worker

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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
				return classifyReportErr(err)
			}
			if ack.GetRejected() > 0 {
				log.Warning("core-api rejected %d of %d agent http log rows", ack.GetRejected(), len(batch))
			}
			return nil
		},
	})
}

// classifyReportErr tells the recorder which failures a resend cannot fix.
func classifyReportErr(err error) error {
	switch status.Code(err) {
	case codes.Unimplemented:
		return egress.Unsupported(err)
	case codes.PermissionDenied, codes.Unauthenticated, codes.InvalidArgument:
		return egress.Permanent(err)
	}
	return err
}

// flushWait bounds how long EXIT waits for a command's request logs: logging
// must never hold up the agent for long when core-api is slow or down.
const flushWait = 2 * time.Second

// flush waits until the command's recorded requests reached core-api. It is
// detached from the command ctx: a cancelled stream must not skip the wait
// that keeps EXIT behind the command's log rows. Keyed by run, not session:
// a long scan elsewhere in the session must not hold this command's EXIT.
func (p *agentProxy) flush(runID string) {
	if p == nil || p.recorder == nil || runID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), flushWait)
	defer cancel()
	p.recorder.FlushRun(ctx, runID)
}

// proxyUser fills the userinfo user slot; the token goes in the password,
// which the egress proxy also accepts. Some clients (GNU wget 1.x) only send
// credentials when both halves are set.
const proxyUser = "oasm"

// env returns the proxy variables for one command's token. No ALL_PROXY:
// run tokens are HTTP-only, the SOCKS half does not accept them.
func (p *agentProxy) env(token string) []string {
	if p == nil {
		return nil
	}
	proxyURL := (&url.URL{Scheme: "http", User: url.UserPassword(proxyUser, token), Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(p.port))}).String()
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

// writeWgetRC writes a wget2 config with the proxy credentials: wget2
// ignores userinfo in http_proxy and would get 407 from the egress proxy.
// It goes in os.TempDir, not the session dir the command can list and keep.
func writeWgetRC(token string) (string, error) {
	f, err := os.CreateTemp("", "oasm-wget2rc-*")
	if err != nil {
		return "", err
	}
	_, err = fmt.Fprintf(f, "http-proxy-user = %s\nhttp-proxy-password = %s\n", proxyUser, token)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// commandEnv builds a host command's env and, with the proxy active, issues
// its run token; runID keys flush. release revokes the token (closing the
// connections still open under it) and removes the wget2 config; it must be
// called once the command has exited and is safe to call again.
func (p *agentProxy) commandEnv(toolPath, sessionID string, log egress.Logger) (env []string, runID string, release func()) {
	if p == nil {
		return setupCmdEnv(toolPath, false), "", func() {}
	}
	token, revoke := p.runs.Issue(sessionID)
	run, _ := p.runs.Lookup(token)
	env = append(setupCmdEnv(toolPath, true), p.env(token)...)
	rc, err := writeWgetRC(token)
	if err != nil {
		// wget2 alone loses the proxy; every other client still works.
		log.Warning("agent proxy: cannot write wget2 config, wget2 will get 407: %v", err)
		return env, run.ID, revoke
	}
	var once sync.Once
	return append(env, "WGET2RC="+rc), run.ID, func() {
		once.Do(func() {
			revoke()
			_ = os.Remove(rc)
		})
	}
}
