package worker

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-rod/rod"
)

func TestSplitArgs(t *testing.T) {
	got, err := splitArgs(`-s b-1 fill @e2 "it's \"x\" here" 'a b' c\ d  ""`)
	want := []string{"-s", "b-1", "fill", "@e2", `it's "x" here`, "a b", "c d", ""}
	if err != nil || !slices.Equal(got, want) {
		t.Fatalf("got %q err %v", got, err)
	}
	for _, bad := range []string{`fill @e1 "oops`, `fill @e1 'oops`} {
		if _, err := splitArgs(bad); err == nil || err.Error() != "unterminated quote" {
			t.Fatalf("%s: want unterminated quote, got %v", bad, err)
		}
	}
}

func TestParseBrowserCmdGlobalFlags(t *testing.T) {
	c, err := parseBrowserCmd([]string{"--allow", "a.com", "--allow", "*.b.com", "--timeout", "5000", "open", "https://a.com"})
	if err != nil || c.name != "open" || !slices.Equal(c.allow, []string{"a.com", "*.b.com"}) || c.timeout != 5*time.Second || !slices.Equal(c.args, []string{"https://a.com"}) {
		t.Fatalf("%+v %v", c, err)
	}
	if c, _ := parseBrowserCmd([]string{"url"}); c.timeout != browserCmdTimeout {
		t.Fatalf("default timeout = %s", c.timeout)
	}
	for _, bad := range [][]string{{"--timeout", "90000", "url"}, {"--bogus", "x", "url"}, {"-s"}} {
		if _, err := parseBrowserCmd(bad); err == nil {
			t.Fatalf("%q must be rejected", bad)
		}
	}
}

func TestBrowserCommandRefusedInSandbox(t *testing.T) {
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) {
		t.Fatal("must not launch")
		return nil, nil, nil
	})
	sb := &sessionSandbox{sessionID: "s", container: &fakeSandbox{}}
	rec := &recordingSender{}
	executeRemoteCommand(context.Background(), rec, "s", "c", "w", "browser open https://x.test", sb, a, nil, "")
	if len(rec.errs) != 1 || rec.errs[0] != "browser commands are not available on a sandboxed worker" || len(rec.stdout)+len(rec.exits) != 0 {
		t.Fatalf("errs=%v stdout=%v exits=%v", rec.errs, rec.stdout, rec.exits)
	}
}

func TestBrowserCommandNeverReachesShell(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "ran")
	sb, err := newSessionSandbox(dir, "s", nil)
	if err != nil {
		t.Fatal(err)
	}
	rec := &recordingSender{}
	executeRemoteCommand(context.Background(), rec, "s", "c", "w", "browser -s b-x url; touch "+marker, sb, newAgentBrowsers(nil, nil), nil, dir)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("browser command line reached sh")
	}
	if len(rec.exits) != 1 || rec.exits[0] != 1 || !strings.Contains(strings.Join(rec.stdout, ""), `unknown command "url;"`) {
		t.Fatalf("stdout=%q exits=%v", rec.stdout, rec.exits)
	}
}

func TestBrowserLaunchFailureIsAnErrorResult(t *testing.T) {
	sb := &sessionSandbox{sessionID: "s", rootPath: t.TempDir()}
	rec := &recordingSender{}
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) { return nil, nil, fmt.Errorf("no chromium") })
	executeRemoteCommand(context.Background(), rec, "s", "c", "w", "browser open example.com", sb, a, nil, "")
	if len(rec.errs) != 1 || !strings.Contains(rec.errs[0], "no chromium") || len(rec.exits) != 0 {
		t.Fatalf("errs=%v exits=%v", rec.errs, rec.exits)
	}
}

func TestBrowserUsageAndArgumentErrors(t *testing.T) {
	a := newAgentBrowsers(nil, nil)
	cases := []struct {
		line   string
		failed bool
		want   string
	}{
		{"", true, "usage: browser"},
		{"help", false, "usage: browser"},
		{"-s b-x nosuchcmd", true, `unknown command "nosuchcmd"`},
		{"title", true, "-s <session> is required"},
		{`-s b-x fill @e1 "oops`, true, "unterminated quote"},
		{"-s b-x --allow a.com open http://a.com", true, "--allow only applies"},
		{"sessions", false, "no browser sessions"},
		{"https://voz.vn", true, `run "browser open https://voz.vn"`},
		{"-s b-x read get title", true, `"get" is a command, drop "read"`},
		{"-s d068ba57-b397 title", true, `"d068ba57-b397" is not a browser session id`},
		{"navigate https://voz.vn", true, `run "browser open https://voz.vn"`},
		{"navigate https://voz.vn && browser title && browser links", true, "one browser command per call"},
		{"-s b-x navigate title", true, `"title" is a command, drop "navigate"`},
		{"-s b-x js eval document.title", true, `"eval" is a command, drop "js"`},
		{"-s b-x title && browser links", true, "one browser command per call"},
	}
	for _, c := range cases {
		out, failed, err := a.run(context.Background(), c.line)
		if err != nil || failed != c.failed || !strings.Contains(out, c.want) {
			t.Errorf("%q: failed=%v err=%v out=%q", c.line, failed, err, out)
		}
	}
}

// --- integration (real Chromium; skipped when it cannot launch) ---

func serveHTML(t *testing.T, pages map[string]string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := pages[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		if loc, ok := strings.CutPrefix(body, "redirect:"); ok {
			http.Redirect(w, r, loc, http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func runOK(t *testing.T, a *agentBrowsers, line string) string {
	t.Helper()
	out, failed, err := a.run(context.Background(), line)
	if err != nil || failed {
		t.Fatalf("browser %s: failed=%v err=%v\n%s", line, failed, err, out)
	}
	return out
}

func runFail(t *testing.T, a *agentBrowsers, line string) string {
	t.Helper()
	out, failed, err := a.run(context.Background(), line)
	if err != nil || !failed {
		t.Fatalf("browser %s: want failure, got failed=%v err=%v\n%s", line, failed, err, out)
	}
	return out
}

var sessionLine = regexp.MustCompile(`(?m)^session: (b-[0-9a-f]{32})$`)

func openSession(t *testing.T, a *agentBrowsers, url string) (id, out string) {
	t.Helper()
	out = runOK(t, a, "open "+url)
	m := sessionLine.FindStringSubmatch(out)
	if m == nil {
		t.Fatalf("no session id in:\n%s", out)
	}
	return m[1], out
}

func TestOpenNavigateAndHistory(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": `<title>One</title><a href="/two">two</a>`, "/two": `<title>Two</title>`})
	id, out := openSession(t, a, srv.URL)
	if !strings.Contains(out, "One — "+srv.URL+"/") {
		t.Fatalf("open output:\n%s", out)
	}
	runOK(t, a, "-s "+id+" open "+srv.URL+"/two")
	if got := runOK(t, a, "-s "+id+" title"); got != "Two" {
		t.Fatalf("title = %q", got)
	}
	runOK(t, a, "-s "+id+" back")
	if got := runOK(t, a, "-s "+id+" url"); got != srv.URL+"/" {
		t.Fatalf("url after back = %q", got)
	}
	runOK(t, a, "-s "+id+" forward")
	runOK(t, a, "-s "+id+" reload")
	if out := runFail(t, a, "-s "+id+" forward"); !strings.Contains(out, "no history entry") {
		t.Fatalf("forward at the end:\n%s", out)
	}
	runOK(t, a, "-s "+id+" close")
	if out := runFail(t, a, "-s "+id+" title"); !strings.Contains(out, "not found") {
		t.Fatalf("after close:\n%s", out)
	}
}

func TestScopeIsEnforced(t *testing.T) {
	a := newTestBrowsers(t)
	other := serveHTML(t, map[string]string{"/": `<title>Other</title>`})
	otherURL := strings.Replace(other.URL, "127.0.0.1", "localhost", 1)
	srv := serveHTML(t, map[string]string{
		"/":   `<title>Home</title><img src="` + otherURL + `/pixel">`,
		"/go": "redirect:" + otherURL + "/",
	})
	id, out := openSession(t, a, srv.URL)
	if !strings.Contains(out, "blocked (out of scope") || !strings.Contains(out, "BLOCKED GET "+otherURL+"/pixel") {
		t.Fatalf("subresource to another host must be reported blocked:\n%s", out)
	}

	if out := runFail(t, a, "-s "+id+" open "+otherURL); !strings.Contains(out, `localhost is not in this session's scope (127.0.0.1); extend it with "allow localhost"`) {
		t.Fatalf("direct open out of scope:\n%s", out)
	}
	out = runOK(t, a, "-s "+id+" open "+srv.URL+"/go")
	if !strings.Contains(out, "BLOCKED GET "+otherURL+"/") || strings.Contains(runOK(t, a, "-s "+id+" title"), "Other") {
		t.Fatalf("redirect out of scope must be blocked:\n%s", out)
	}

	runOK(t, a, "-s "+id+" allow localhost")
	runOK(t, a, "-s "+id+" open "+otherURL)
	if got := runOK(t, a, "-s "+id+" title"); got != "Other" {
		t.Fatalf("after allow, title = %q", got)
	}
}

func TestConcurrentCommandsOnOneSession(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": `<title>T</title>`})
	id, _ := openSession(t, a, srv.URL)
	var wg sync.WaitGroup
	errs := make(chan string, 10)
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if out, failed, err := a.run(context.Background(), "-s "+id+" title"); failed || err != nil || out != "T" {
				errs <- fmt.Sprintf("failed=%v err=%v out=%q", failed, err, out)
			}
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Error(e)
	}
}

func TestBrowserCommandLogOmitsArguments(t *testing.T) {
	events := make(chan TuiEvent, 16)
	sb := &sessionSandbox{sessionID: "s", rootPath: t.TempDir()}
	executeRemoteCommand(context.Background(), &recordingSender{}, "s", "c", "w", "browser -s b-x set credentials admin s3cret", sb, newAgentBrowsers(nil, nil), events, "")
	close(events)
	logged := false
	for ev := range events {
		line := fmt.Sprintf("%+v", ev)
		if strings.Contains(line, "s3cret") {
			t.Fatalf("password logged: %s", line)
		}
		logged = logged || strings.Contains(line, "browser set")
	}
	if !logged {
		t.Fatal("browser command not logged at all")
	}
}
