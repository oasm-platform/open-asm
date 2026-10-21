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

func TestTokenizeSplitsLikeAShell(t *testing.T) {
	toks, err := tokenize(`-s b-1 fill @e2 "it's \"x\" here" 'a b' c\ d  ""`)
	got := make([]string, len(toks))
	for i, tok := range toks {
		got[i] = tok.val
	}
	want := []string{"-s", "b-1", "fill", "@e2", `it's "x" here`, "a b", "c d", ""}
	if err != nil || !slices.Equal(got, want) {
		t.Fatalf("got %q err %v", got, err)
	}
	for _, bad := range []string{`fill @e1 "oops`, `fill @e1 'oops`} {
		if _, err := tokenize(bad); err == nil || err.Error() != "unterminated quote" {
			t.Fatalf("%s: want unterminated quote, got %v", bad, err)
		}
	}
}

func TestTokenizeMarksQuotedBytes(t *testing.T) {
	toks, err := tokenize(`a;b ";" 'x y' c\;`)
	if err != nil {
		t.Fatal(err)
	}
	want := []argToken{{"a;b", "a;b"}, {";", "\x00"}, {"x y", "\x00\x00\x00"}, {"c;", "c\x00"}}
	if !slices.Equal(toks, want) {
		t.Fatalf("got %q", toks)
	}
}

func TestChainOperator(t *testing.T) {
	cases := map[string]string{
		`;`: ";", `&&`: "&&", `||`: "||", `|`: "|",
		`example.com;`: ";", `a&&b`: "&&", `x||`: "||",
		`";"`: "", `'|'`: "", `"a && b"`: "", `c\;`: "",
		`xpath=//a|//b`: "", `https://x.test/?a=1&b=2`: "",
	}
	for in, want := range cases {
		toks, err := tokenize(in)
		if err != nil || len(toks) != 1 {
			t.Fatalf("%s: %q %v", in, toks, err)
		}
		if got := chainOperator(toks[0]); got != want {
			t.Errorf("chainOperator(%s) = %q, want %q", in, got, want)
		}
	}
}

func parseLine(t *testing.T, line string) (browserCmd, error) {
	t.Helper()
	toks, err := tokenize(line)
	if err != nil {
		t.Fatal(err)
	}
	return parseBrowserCmd(toks)
}

func TestParseBrowserCmdGlobalFlags(t *testing.T) {
	c, err := parseLine(t, "--timeout 5000 -s b-x open https://a.com")
	if err != nil || c.name != "open" || c.session != "b-x" || c.timeout != 5*time.Second || !slices.Equal(c.args, []string{"https://a.com"}) {
		t.Fatalf("%+v %v", c, err)
	}
	if c, _ := parseLine(t, "url"); c.timeout != browserCmdTimeout {
		t.Fatalf("default timeout = %s", c.timeout)
	}
	for _, bad := range []string{"--timeout 90000 url", "--bogus x url", "-s", "-s b-x wait --text a --timeout 0"} {
		if _, err := parseLine(t, bad); err == nil {
			t.Fatalf("%q must be rejected", bad)
		}
	}
}

func TestParseBrowserCmdFlagsAfterTheCommand(t *testing.T) {
	id := "b-0123456789abcdef0123456789abcdef"
	c, err := parseLine(t, "open https://app.x --timeout 50000")
	if err != nil || !slices.Equal(c.args, []string{"https://app.x"}) || c.timeout != 50*time.Second {
		t.Fatalf("%+v %v", c, err)
	}
	if c, _ = parseLine(t, "title -s "+id); c.session != id || len(c.args) != 0 {
		t.Fatalf("trailing -s: %+v", c)
	}
	// snapshot's own -s takes a selector, and quoted values stay values.
	if c, _ = parseLine(t, "-s "+id+" snapshot -s main"); c.session != id || !slices.Equal(c.args, []string{"-s", "main"}) {
		t.Fatalf("snapshot -s: %+v", c)
	}
	if c, _ = parseLine(t, `-s `+id+` fill @e1 "--timeout" 5`); c.timeout != browserCmdTimeout || !slices.Equal(c.args, []string{"@e1", "--timeout", "5"}) {
		t.Fatalf("quoted flag: %+v", c)
	}
}

func TestBrowserCommandOnSharedWorkerRefusesLocalHosts(t *testing.T) {
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) {
		t.Fatal("must not launch")
		return nil, nil, nil
	})
	a.publicOnly = true
	for line, want := range map[string]string{
		"open http://127.0.0.1:8080":      "127.0.0.1 is not a public address; this worker is shared",
		"open http://localhost:3000":      "localhost is the worker itself",
		"open http://169.254.169.254/":    "169.254.169.254 is not a public address",
		"open http://[fd00::1]/":          "fd00::1 is not a public address",
		"open http://10.1.2.3/admin":      "10.1.2.3 is not a public address",
		"open http://app.localhost:5173/": "app.localhost is the worker itself",
	} {
		if out, failed, err := a.run(context.Background(), line); err != nil || !failed || !strings.Contains(out, want) {
			t.Errorf("%s: failed=%v err=%v out=%q", line, failed, err, out)
		}
	}
}

func TestBrowserCommandNeverReachesShell(t *testing.T) {
	line, ok := browserCommandLine("browser -s b-x url; touch x")
	if !ok || line != "-s b-x url; touch x" {
		t.Fatalf("not routed to the browser: %q %v", line, ok)
	}
	if _, ok := browserCommandLine("browserx"); ok {
		t.Fatal("browserx is not a browser command")
	}

	// Even if one reached the shell path, it must not run there.
	dir := t.TempDir()
	marker := filepath.Join(dir, "ran")
	sb, err := newSessionSandbox(dir, "s", nil)
	if err != nil {
		t.Fatal(err)
	}
	rec := &recordingSender{}
	executeRemoteCommand(context.Background(), rec, "s", "browser -s b-x url; touch "+marker, sb, nil, dir)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("browser command line reached sh")
	}
	if len(rec.errs) != 1 || len(rec.exits) != 0 {
		t.Fatalf("errs=%v exits=%v", rec.errs, rec.exits)
	}

	rec = &recordingSender{}
	executeBrowserCommand(context.Background(), rec, "s", line, newAgentBrowsers(nil, nil), nil)
	if len(rec.exits) != 1 || rec.exits[0] != 1 || !strings.Contains(strings.Join(rec.stdout, ""), "one browser command per call") {
		t.Fatalf("stdout=%q exits=%v", rec.stdout, rec.exits)
	}
}

func TestBrowserLaunchFailureIsAnErrorResult(t *testing.T) {
	rec := &recordingSender{}
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) { return nil, nil, fmt.Errorf("no chromium") })
	executeBrowserCommand(context.Background(), rec, "s", "open example.com", a, nil)
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
		{"--allow a.com open http://a.com", true, "unknown flag --allow"},
		{"sessions", false, "0 browser session(s) open on this worker"},
		{"open https://a.com extra", true, "open takes one url"},
		{`-s b-x type @e1 ";"`, true, "browser session b-x not found"},
		{"open example.com; browser -s b-x snapshot", true, "one browser command per call"},
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

func TestAnyHostIsReachable(t *testing.T) {
	a := newTestBrowsers(t)
	other := serveHTML(t, map[string]string{"/": `<title>Other</title>`, "/pixel": `x`})
	otherURL := strings.Replace(other.URL, "127.0.0.1", "localhost", 1)
	srv := serveHTML(t, map[string]string{
		"/":   `<title>Home</title><img src="` + otherURL + `/pixel">`,
		"/go": "redirect:" + otherURL + "/",
	})
	id, out := openSession(t, a, srv.URL)
	if strings.Contains(out, "BLOCKED") || !strings.Contains(runOK(t, a, "-s "+id+" requests"), "<- 200 "+otherURL+"/pixel") {
		t.Fatalf("subresource on another host must load:\n%s", out)
	}
	runOK(t, a, "-s "+id+" open "+srv.URL+"/go")
	if got := runOK(t, a, "-s "+id+" title"); got != "Other" {
		t.Fatalf("redirect to another host: title = %q", got)
	}
	runOK(t, a, "-s "+id+" open "+srv.URL)
	runOK(t, a, "-s "+id+" open "+otherURL)
	if got := runOK(t, a, "-s "+id+" title"); got != "Other" {
		t.Fatalf("open on another host: title = %q", got)
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
	const command = "browser -s b-x set credentials admin s3cret"
	if got := loggableCommand(command); got != "browser set" {
		t.Fatalf("loggableCommand = %q", got)
	}
	events := make(chan TuiEvent, 16)
	line, _ := browserCommandLine(command)
	executeBrowserCommand(context.Background(), &recordingSender{}, "s", line, newAgentBrowsers(nil, nil), events)
	close(events)
	for ev := range events {
		if l := fmt.Sprintf("%+v", ev); strings.Contains(l, "s3cret") {
			t.Fatalf("password logged: %s", l)
		}
	}
}

func TestSPAHistoryAndBeforeUnload(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{
		"/":      `<title>Home</title><button onclick="history.pushState({}, '', '/route')">route</button>`,
		"/leave": `<title>Leave</title><input id="i"><script>addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = '' })</script>`,
		"/two":   `<title>Two</title>`,
	})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("click text=route")
	if got := run("url"); got != srv.URL+"/route" {
		t.Fatalf("url after pushState = %q", got)
	}
	run("--timeout 5000 back") // same-document: no FrameNavigated
	if got := run("url"); got != srv.URL+"/" {
		t.Fatalf("url after back = %q", got)
	}
	run("--timeout 5000 forward")
	run("--timeout 5000 open " + srv.URL + "/#frag")

	// A page that asks before unloading (after a user gesture) must neither
	// block navigation nor survive "tab close".
	run("open " + srv.URL + "/leave")
	run("type #i x")
	run("--timeout 5000 open " + srv.URL + "/two")
	if got := run("title"); got != "Two" {
		t.Fatalf("navigation away from a beforeunload page: title %q", got)
	}
	run("open " + srv.URL + "/leave")
	run("type #i x")
	run("tab new")
	run("--timeout 5000 tab close 0")
	if list := run("tab list"); strings.Contains(list, "Leave") {
		t.Fatalf("tab with beforeunload still open:\n%s", list)
	}
}

func TestWedgedPageClosesItsSession(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": `<title>W</title><button onclick="for (;;) {}">spin</button>`})
	id, _ := openSession(t, a, srv.URL)
	start := time.Now()
	out := runFail(t, a, "-s "+id+" --timeout 1000 click text=spin")
	if !strings.Contains(out, "page stopped responding") {
		t.Fatalf("wedged click:\n%s", out)
	}
	if d := time.Since(start); d > 1*time.Second+3*browserWedgeGrace {
		t.Fatalf("wedged command held the session for %s", d)
	}
	if out := runFail(t, a, "-s "+id+" title"); !strings.Contains(out, "not found") {
		t.Fatalf("wedged session must be gone:\n%s", out)
	}
	if n := a.count(); n != 0 {
		t.Fatalf("wedged session still counted: %d", n)
	}
	openSession(t, a, srv.URL) // the browser itself still works
}
