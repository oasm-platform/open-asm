package worker

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTabsAndPopups(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{
		"/":    `<title>Main</title><a href="/pop" target="_blank">pop</a>`,
		"/pop": `<title>Pop</title>`,
		"/b":   `<title>B</title>`,
	})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("tab new " + srv.URL + "/b")
	if got := run("title"); got != "B" {
		t.Fatalf("new tab title %q", got)
	}
	list := run("tab list")
	if !strings.Contains(list, "  0 Main") || !strings.Contains(list, "* 1 B") {
		t.Fatalf("tab list:\n%s", list)
	}
	run("tab 0")
	run("click text=pop")
	run("wait 300")
	if !strings.Contains(run("tab list"), "2 Pop") {
		t.Fatalf("popup not adopted:\n%s", run("tab list"))
	}
	run("tab close 2")
	run("tab close 1")
	if list := run("tab list"); strings.Contains(list, "Pop") || strings.Contains(list, " B ") {
		t.Fatalf("after close:\n%s", list)
	}
	if out := runFail(t, a, "-s "+id+" tab 5"); !strings.Contains(out, "no tab 5") {
		t.Fatalf("bad tab:\n%s", out)
	}
}

func TestFramesDialogsAndConsole(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{
		"/":      `<title>F</title><iframe id="fr" src="/inner"></iframe><button id="al" onclick="alert('hi'); document.title='after alert'">A</button><button id="cf" onclick="document.title = confirm('sure?') ? 'yes' : 'no'">C</button><button id="er" onclick="console.log('log', 42); undefinedFn()">E</button>`,
		"/inner": `<button onclick="document.body.dataset.hit='1'">Inner</button>`,
	})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("frame #fr")
	if snap := run("snapshot -i"); !strings.Contains(snap, `button "Inner"`) {
		t.Fatalf("frame snapshot:\n%s", snap)
	}
	run("click text=Inner")
	if got := run(`eval "document.body.dataset.hit"`); got != "1" {
		t.Fatalf("click inside frame: %q", got)
	}
	run("frame main")

	run("click #al") // must not wedge on the alert
	if got := run("title"); got != "after alert" {
		t.Fatalf("after alert title %q", got)
	}
	run("click #cf")
	if got := run("title"); got != "no" {
		t.Fatalf("confirm dismissed by default, title %q", got)
	}
	run("dialog accept")
	run("click #cf")
	if got := run("title"); got != "yes" {
		t.Fatalf("confirm accepted, title %q", got)
	}
	run("click #er")
	run("wait 100")
	if c := run("console"); !strings.Contains(c, "[dialog alert accepted] hi") || !strings.Contains(c, "[log] log 42") {
		t.Fatalf("console:\n%s", c)
	}
	if e := run("errors"); !strings.Contains(e, "undefinedFn") {
		t.Fatalf("errors:\n%s", e)
	}
	run("console --clear")
	if run("console") != "(empty)" {
		t.Fatal("console --clear")
	}
}

func TestCookiesStorageHeadersAndEmulation(t *testing.T) {
	a := newTestBrowsers(t)
	var gotAuth, gotTest string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotTest = r.Header.Get("Authorization"), r.Header.Get("X-Test")
		http.SetCookie(w, &http.Cookie{Name: "sid", Value: "abc", HttpOnly: true})
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>S</title>`))
	}))
	defer srv.Close()
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	if c := run("cookies"); !strings.Contains(c, "sid=abc") || !strings.Contains(c, "httpOnly") {
		t.Fatalf("cookies:\n%s", c)
	}
	run("cookies set theme dark")
	if c := run("cookies"); !strings.Contains(c, "theme=dark") {
		t.Fatalf("cookie set:\n%s", c)
	}
	run("cookies clear")
	if run("cookies") != "no cookies" {
		t.Fatal("cookies clear")
	}

	run(`storage local set k "v 1"`)
	if run("storage local get k") != "v 1" || run("storage local") != `{"k":"v 1"}` {
		t.Fatal("local storage")
	}
	run("storage local clear")
	if out := runFail(t, a, "-s "+id+" storage local get k"); !strings.Contains(out, "no localStorage key") {
		t.Fatalf("missing key:\n%s", out)
	}

	run(`set headers '{"X-Test":"yes"}'`)
	run("set credentials alice s3cret")
	run("reload")
	if gotTest != "yes" || gotAuth != "Basic YWxpY2U6czNjcmV0" {
		t.Fatalf("headers not sent: X-Test=%q Authorization=%q", gotTest, gotAuth)
	}
	if !strings.Contains(run("requests --filter "+srv.URL), "GET "+srv.URL) {
		t.Fatal("requests log")
	}

	run("set viewport 400 300")
	if run("eval window.innerWidth") != "400" {
		t.Fatal("viewport")
	}
	run("set media dark")
	if run(`eval "matchMedia('(prefers-color-scheme: dark)').matches"`) != "true" {
		t.Fatal("media")
	}
	run("set useragent TestAgent/1")
	if run("eval navigator.userAgent") != "TestAgent/1" {
		t.Fatal("useragent")
	}
	run("set offline on")
	if run("eval navigator.onLine") != "false" {
		t.Fatal("offline")
	}
	run("set offline off")
}

func TestClosingAnEarlierTabKeepsTheActiveOne(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": `<title>A</title>`, "/b": `<title>B</title>`, "/c": `<title>C</title>`})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("tab new " + srv.URL + "/b")
	run("tab new " + srv.URL + "/c")
	run("tab 1")
	run("tab close 0")
	if got := run("title"); got != "B" {
		t.Fatalf("active tab after closing tab 0 = %q, want B", got)
	}
	if list := run("tab list"); !strings.Contains(list, "* 0 B") {
		t.Fatalf("tab list:\n%s", list)
	}
}

func TestPopupsGetSessionHeaders(t *testing.T) {
	a := newTestBrowsers(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/echo" {
			_, _ = w.Write([]byte(r.Header.Get("Authorization")))
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<title>Main</title><a href="/pop" target="_blank">pop</a>`))
	}))
	defer srv.Close()
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("set credentials alice s3cret")
	run("click text=pop")
	run("wait 300")
	run("tab 1")
	if got := run(`eval "fetch('/echo').then(r => r.text())"`); got != "Basic YWxpY2U6czNjcmV0" {
		t.Fatalf("popup request Authorization = %q", got)
	}
}
