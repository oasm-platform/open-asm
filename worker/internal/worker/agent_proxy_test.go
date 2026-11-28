package worker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"oasm-worker/internal/egress"
	workers "oasm-worker/internal/gen/workers"
)

var proxyEnvKeys = []string{"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy", "ALL_PROXY", "all_proxy"}

func envValues(env []string, key string) []string {
	var out []string
	for _, e := range env {
		if k, v, ok := strings.Cut(e, "="); ok && k == key {
			out = append(out, v)
		}
	}
	return out
}

func TestAgentProxyEnv(t *testing.T) {
	p := &agentProxy{runs: egress.NewRunCredentials(), port: 26277, grpcHost: "core-api"}
	got := p.env("abc123")
	want := []string{
		"HTTP_PROXY=http://oasm:abc123@127.0.0.1:26277",
		"HTTPS_PROXY=http://oasm:abc123@127.0.0.1:26277",
		"http_proxy=http://oasm:abc123@127.0.0.1:26277",
		"https_proxy=http://oasm:abc123@127.0.0.1:26277",
		"NO_PROXY=localhost,127.0.0.1,::1,core-api",
		"no_proxy=localhost,127.0.0.1,::1,core-api",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("env =\n%v\nwant\n%v", got, want)
	}

	var nilProxy *agentProxy
	if env := nilProxy.env("abc123"); len(env) != 0 {
		t.Fatalf("nil proxy must add no vars, got %v", env)
	}
}

// Without the egress proxy, agent commands keep today's env, inherited
// proxy settings included.
func TestAgentProxyCommandEnvNilKeepsToday(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://corp-proxy:3128")
	var p *agentProxy
	env, _, revoke := p.commandEnv("/opt/tools", "sess", &warnCapture{})
	revoke()
	if !slices.Equal(env, setupCmdEnv("/opt/tools", false)) {
		t.Fatalf("nil proxy env differs from setupCmdEnv")
	}
	if v := envValues(env, "HTTPS_PROXY"); len(v) != 1 || v[0] != "http://corp-proxy:3128" {
		t.Fatalf("inherited HTTPS_PROXY must be kept, got %v", v)
	}
}

func TestAgentProxyCommandEnvReplacesInherited(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://corp-proxy:3128")
	t.Setenv("all_proxy", "socks5://corp:1080")
	runs := egress.NewRunCredentials()
	p := &agentProxy{runs: runs, port: 4000, grpcHost: "core"}
	env, _, revoke := p.commandEnv("/opt/tools", "sess-x", &warnCapture{})
	v := envValues(env, "HTTPS_PROXY")
	if len(v) != 1 || !strings.HasPrefix(v[0], "http://") || !strings.HasSuffix(v[0], "@127.0.0.1:4000") {
		t.Fatalf("HTTPS_PROXY = %v, want exactly the agent proxy", v)
	}
	if len(envValues(env, "all_proxy")) != 0 {
		t.Fatal("inherited all_proxy must be dropped")
	}
	token := strings.TrimSuffix(strings.TrimPrefix(v[0], "http://oasm:"), "@127.0.0.1:4000")
	if s, ok := runs.Lookup(token); !ok || s.SessionID != "sess-x" {
		t.Fatalf("issued token must resolve to the session, got %q %v", s, ok)
	}
	revoke()
	if _, ok := runs.Lookup(token); ok {
		t.Fatal("revoke must invalidate the token")
	}
}

func TestSetupCmdEnvDropsInheritedProxyVars(t *testing.T) {
	for _, k := range proxyEnvKeys {
		t.Setenv(k, "http://inherited:1")
	}
	t.Setenv("KEEP_ME", "yes")

	env := setupCmdEnv("/opt/tools", true)
	for _, k := range proxyEnvKeys {
		if v := envValues(env, k); len(v) != 0 {
			t.Errorf("%s must be dropped, got %v", k, v)
		}
	}
	if len(envValues(env, "KEEP_ME")) != 1 {
		t.Error("unrelated env must be kept")
	}

	kept := setupCmdEnv("/opt/tools", false)
	for _, k := range proxyEnvKeys {
		if v := envValues(kept, k); len(v) != 1 {
			t.Errorf("without the agent proxy %s must be kept, got %v", k, v)
		}
	}
}

// The token dies with the command: a background child that outlives the
// shell can no longer use the proxy.
func TestExecuteRemoteCommandProxiedRevokesAtExit(t *testing.T) {
	runs := egress.NewRunCredentials()
	p := &agentProxy{runs: runs, port: 4000, grpcHost: "core"}
	sb, err := newSessionSandbox(t.TempDir(), "sess-p", nil)
	if err != nil {
		t.Fatal(err)
	}
	rec := &recordingSender{}
	executeRemoteCommand(context.Background(), rec, "sess-p", `printf '%s' "$HTTP_PROXY"`, sb, nil, "/tools", p)

	out := strings.Join(rec.stdout, "")
	if !strings.HasPrefix(out, "http://") || !strings.HasSuffix(out, "@127.0.0.1:4000") {
		t.Fatalf("command must see the agent proxy, got %q", out)
	}
	if len(rec.exits) != 1 || rec.exits[0] != 0 {
		t.Fatalf("exits = %v, want [0]", rec.exits)
	}
	token := strings.TrimSuffix(strings.TrimPrefix(out, "http://oasm:"), "@127.0.0.1:4000")
	if _, ok := runs.Lookup(token); ok {
		t.Fatal("token must be revoked once the command exits")
	}
}

// exitCheckingSender records, at the moment EXIT is sent, whether the run
// token was already revoked and the session's log batch already delivered.
type exitCheckingSender struct {
	recordingSender
	runs      *egress.RunCredentials
	rec       *egress.Recorder
	token     string
	delivered *atomic.Bool

	tokenLiveAtExit, undeliveredAtExit bool
}

// SendStdout stands in for a proxied request: the command printed its
// proxy URL, so record one event under the command's run.
func (s *exitCheckingSender) SendStdout(ctx context.Context, b []byte) error {
	s.token = strings.TrimSuffix(strings.TrimPrefix(string(b), "http://oasm:"), "@127.0.0.1:4000")
	run, _ := s.runs.Lookup(s.token)
	s.rec.Record(egress.HTTPEvent{ID: egress.NewEventID(), SessionID: run.SessionID, RunID: run.ID, Outcome: egress.OutcomeAllowed})
	return s.recordingSender.SendStdout(ctx, b)
}

func (s *exitCheckingSender) SendExit(ctx context.Context, c int32) error {
	_, s.tokenLiveAtExit = s.runs.Lookup(s.token)
	s.undeliveredAtExit = !s.delivered.Load()
	return s.recordingSender.SendExit(ctx, c)
}

// Core-api must have the command's request rows before it sees EXIT, or the
// agent's next turn could look for logs that are still on the worker.
func TestRemoteCommandFlushesBeforeExit(t *testing.T) {
	var delivered atomic.Bool
	rec := egress.NewRecorder(egress.RecorderOptions{
		Interval: 10 * time.Millisecond,
		Send: func(context.Context, []egress.HTTPEvent, uint64) error {
			// Slow enough that EXIT would win without the flush wait.
			time.Sleep(300 * time.Millisecond)
			delivered.Store(true)
			return nil
		},
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go rec.Run(ctx)

	runs := egress.NewRunCredentials()
	p := &agentProxy{runs: runs, port: 4000, grpcHost: "core", recorder: rec}
	sb, err := newSessionSandbox(t.TempDir(), "sess-f", nil)
	if err != nil {
		t.Fatal(err)
	}
	s := &exitCheckingSender{runs: runs, rec: rec, delivered: &delivered}
	executeRemoteCommand(context.Background(), s, "sess-f", `printf '%s' "$HTTP_PROXY"`, sb, nil, "/tools", p)

	if len(s.exits) != 1 || s.exits[0] != 0 {
		t.Fatalf("exits = %v, want [0]", s.exits)
	}
	if s.token == "" {
		t.Fatal("command printed no proxy token")
	}
	if s.tokenLiveAtExit {
		t.Fatal("token must be revoked before EXIT is sent")
	}
	if s.undeliveredAtExit {
		t.Fatal("the session's log batch must be delivered before EXIT is sent")
	}
}

// A nil proxy (no egress server) has nothing to flush and must not block.
func TestAgentProxyFlushNil(t *testing.T) {
	var p *agentProxy
	p.flush("sess")
}

type fakeLogReporter struct {
	calls atomic.Int32
	ack   *workers.EgressHttpLogAck
}

func (f *fakeLogReporter) ReportEgressHttpLogs(context.Context, []egress.HTTPEvent, uint64) (*workers.EgressHttpLogAck, error) {
	f.calls.Add(1)
	return f.ack, nil
}

type warnCapture struct {
	mu    sync.Mutex
	warns []string
}

func (w *warnCapture) Info(string, ...any) {}
func (w *warnCapture) Warning(msg string, args ...any) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.warns = append(w.warns, fmt.Sprintf(msg, args...))
}

// Rejections are final on the core-api side: warn once, never resend.
func TestEgressRecorderWarnsOnRejectedWithoutRetry(t *testing.T) {
	client := &fakeLogReporter{ack: &workers.EgressHttpLogAck{Accepted: 1, Rejected: 1}}
	log := &warnCapture{}
	rec := newEgressRecorder(client, log)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go rec.Run(ctx)

	rec.Record(egress.HTTPEvent{ID: "a", RunID: "s"})
	rec.Record(egress.HTTPEvent{ID: "b", RunID: "s"})
	fctx, fcancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer fcancel()
	rec.FlushRun(fctx, "s")

	if n := client.calls.Load(); n != 1 {
		t.Fatalf("send calls = %d, want 1", n)
	}
	log.mu.Lock()
	defer log.mu.Unlock()
	if len(log.warns) != 1 || !strings.Contains(log.warns[0], "rejected 1 of 2") {
		t.Fatalf("warnings = %v", log.warns)
	}
}

type errLogReporter struct {
	calls atomic.Int32
	err   error
}

func (f *errLogReporter) ReportEgressHttpLogs(context.Context, []egress.HTTPEvent, uint64) (*workers.EgressHttpLogAck, error) {
	f.calls.Add(1)
	return nil, f.err
}

// Resending cannot fix these, and an older core-api without the RPC must not
// cost every command the full flush wait.
func TestEgressRecorderPermanentCodesSendOnce(t *testing.T) {
	for _, code := range []codes.Code{codes.Unimplemented, codes.PermissionDenied, codes.Unauthenticated, codes.InvalidArgument} {
		t.Run(code.String(), func(t *testing.T) {
			client := &errLogReporter{err: fmt.Errorf("report egress http logs: %w", status.Error(code, "no"))}
			log := &warnCapture{}
			rec := newEgressRecorder(client, log)
			go rec.Run(t.Context())

			rec.Record(egress.HTTPEvent{ID: "a", RunID: "s"})
			ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
			defer cancel()
			start := time.Now()
			rec.FlushRun(ctx, "s")
			if d := time.Since(start); d > 300*time.Millisecond {
				t.Fatalf("FlushRun took %v", d)
			}
			if n := client.calls.Load(); n != 1 {
				t.Fatalf("send calls = %d, want 1", n)
			}
			log.mu.Lock()
			defer log.mu.Unlock()
			if code == codes.Unimplemented && (len(log.warns) != 1 || !strings.HasSuffix(log.warns[0], "paused for 10m")) {
				t.Fatalf("warnings = %v", log.warns)
			}
		})
	}
}

func TestEgressRecorderRetriesTransientCodes(t *testing.T) {
	client := &errLogReporter{err: status.Error(codes.Unavailable, "down")}
	rec := newEgressRecorder(client, &warnCapture{})
	go rec.Run(t.Context())
	rec.Record(egress.HTTPEvent{ID: "a", RunID: "s"})
	ctx, cancel := context.WithTimeout(t.Context(), 800*time.Millisecond)
	defer cancel()
	rec.FlushRun(ctx, "s")
	if ctx.Err() == nil {
		t.Fatal("an unavailable core-api must be retried, not dropped at once")
	}
	if n := client.calls.Load(); n < 2 {
		t.Fatalf("send calls = %d, want a retry", n)
	}
}

func TestWriteWgetRC(t *testing.T) {
	path, err := writeWgetRC("tok123")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	if filepath.Dir(path) != filepath.Clean(os.TempDir()) {
		t.Fatalf("rc file %s must live in %s", path, os.TempDir())
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, want 0600", fi.Mode().Perm())
	}
	b, _ := os.ReadFile(path)
	if want := "http-proxy-user = oasm\nhttp-proxy-password = tok123\n"; string(b) != want {
		t.Fatalf("contents = %q, want %q", b, want)
	}
}

// wget2 ignores proxy-URL userinfo; WGET2RC hands it the same credentials.
func TestAgentProxyCommandEnvWgetRC(t *testing.T) {
	runs := egress.NewRunCredentials()
	p := &agentProxy{runs: runs, port: 4000, grpcHost: "core"}
	env, _, release := p.commandEnv("/opt/tools", "sess-w", &warnCapture{})
	rc := envValues(env, "WGET2RC")
	if len(rc) != 1 {
		t.Fatalf("WGET2RC = %v, want one", rc)
	}
	token := strings.TrimSuffix(strings.TrimPrefix(envValues(env, "HTTP_PROXY")[0], "http://oasm:"), "@127.0.0.1:4000")
	b, err := os.ReadFile(rc[0])
	if err != nil || !strings.Contains(string(b), "http-proxy-password = "+token+"\n") {
		t.Fatalf("rc = %q, %v; want the run token", b, err)
	}
	release()
	release()
	if _, err := os.Stat(rc[0]); !os.IsNotExist(err) {
		t.Fatalf("rc file must be removed on release, stat err = %v", err)
	}
}

func TestExecuteRemoteCommandRemovesWgetRC(t *testing.T) {
	p := &agentProxy{runs: egress.NewRunCredentials(), port: 4000, grpcHost: "core"}
	sb, err := newSessionSandbox(t.TempDir(), "sess-rc", nil)
	if err != nil {
		t.Fatal(err)
	}
	rec := &recordingSender{}
	executeRemoteCommand(context.Background(), rec, "sess-rc", `test -s "$WGET2RC" && printf '%s' "$WGET2RC"`, sb, nil, "/tools", p)
	path := strings.Join(rec.stdout, "")
	if path == "" || len(rec.exits) != 1 || rec.exits[0] != 0 {
		t.Fatalf("command must see a non-empty WGET2RC file, out=%q exits=%v", path, rec.exits)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("rc file must be gone after exit, stat err = %v", err)
	}
}

// A failed rc write costs wget2 only: the command still runs proxied.
func TestAgentProxyCommandEnvWgetRCFailureKeepsProxy(t *testing.T) {
	t.Setenv("TMPDIR", filepath.Join(t.TempDir(), "missing"))
	p := &agentProxy{runs: egress.NewRunCredentials(), port: 4000, grpcHost: "core"}
	log := &warnCapture{}
	env, _, release := p.commandEnv("/opt/tools", "sess-f", log)
	defer release()
	if len(envValues(env, "WGET2RC")) != 0 {
		t.Fatal("WGET2RC must be unset when the file could not be written")
	}
	if len(envValues(env, "HTTP_PROXY")) != 1 {
		t.Fatal("the proxy env must still be set")
	}
	if len(log.warns) != 1 || !strings.Contains(log.warns[0], "wget2") {
		t.Fatalf("warnings = %v", log.warns)
	}
}
