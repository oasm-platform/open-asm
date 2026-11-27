package worker

import (
	"context"
	"slices"
	"strings"
	"testing"

	"oasm-worker/internal/egress"
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
		"HTTP_PROXY=http://abc123@127.0.0.1:26277",
		"HTTPS_PROXY=http://abc123@127.0.0.1:26277",
		"http_proxy=http://abc123@127.0.0.1:26277",
		"https_proxy=http://abc123@127.0.0.1:26277",
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
	env, revoke := p.commandEnv("/opt/tools", "sess")
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
	env, revoke := p.commandEnv("/opt/tools", "sess-x")
	v := envValues(env, "HTTPS_PROXY")
	if len(v) != 1 || !strings.HasPrefix(v[0], "http://") || !strings.HasSuffix(v[0], "@127.0.0.1:4000") {
		t.Fatalf("HTTPS_PROXY = %v, want exactly the agent proxy", v)
	}
	if len(envValues(env, "all_proxy")) != 0 {
		t.Fatal("inherited all_proxy must be dropped")
	}
	token := strings.TrimSuffix(strings.TrimPrefix(v[0], "http://"), "@127.0.0.1:4000")
	if s, ok := runs.Lookup(token); !ok || s != "sess-x" {
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
	token := strings.TrimSuffix(strings.TrimPrefix(out, "http://"), "@127.0.0.1:4000")
	if _, ok := runs.Lookup(token); ok {
		t.Fatal("token must be revoked once the command exits")
	}
}
