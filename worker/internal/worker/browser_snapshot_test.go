package worker

import (
	"context"
	"regexp"
	"strings"
	"testing"
)

const snapshotPage = `<title>Snap</title>
<h1>Welcome</h1>
<p>Some intro text</p>
<form id="f">
  <label>Email <input name="email" value="a@b.c"></label>
  <label><input type="checkbox" checked> Remember</label>
  <button disabled>Send</button>
</form>
<nav><a href="/two">Next page</a></nav>`

func TestSnapshotFullAndInteractive(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": snapshotPage, "/two": `<title>Two</title>`})
	id, out := openSession(t, a, srv.URL)

	// open prints the interactive snapshot: flat, interactive roles only.
	for _, want := range []string{`- textbox "Email" [ref=e`, `value="a@b.c"`, `- checkbox "Remember" [ref=e`, "[checked]", `- button "Send" [ref=e`, "[disabled]", `- link "Next page" [ref=e`} {
		if !strings.Contains(out, want) {
			t.Errorf("open snapshot missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "heading") {
		t.Errorf("-i must not list headings:\n%s", out)
	}

	full := runOK(t, a, "-s "+id+" snapshot")
	for _, want := range []string{`- heading "Welcome" [ref=e1] [level=1]`, `- StaticText "Some intro text"`, `  - textbox "Email"`} {
		if !strings.Contains(full, want) {
			t.Errorf("full snapshot missing %q:\n%s", want, full)
		}
	}
	// A link's own text is its name; it must not repeat as a child line.
	if strings.Count(full, `"Next page"`) != 1 {
		t.Errorf("link text duplicated:\n%s", full)
	}

	scoped := runOK(t, a, "-s "+id+" snapshot -s nav")
	if !strings.Contains(scoped, "Next page") || strings.Contains(scoped, "Welcome") {
		t.Errorf("scoped snapshot:\n%s", scoped)
	}
	shallow := runOK(t, a, "-s "+id+" snapshot -d 1")
	if regexp.MustCompile(`(?m)^ `).MatchString(shallow) {
		t.Errorf("-d 1 must print top level only:\n%s", shallow)
	}
	if out := runFail(t, a, "-s "+id+" snapshot -s #missing"); !strings.Contains(out, `no element matches "#missing"`) {
		t.Errorf("missing scope:\n%s", out)
	}
}

func TestRefsResolveAndGoStale(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": snapshotPage, "/two": `<title>Two</title>`})
	id, out := openSession(t, a, srv.URL)
	ref := regexp.MustCompile(`link "Next page" \[ref=(e\d+)\]`).FindStringSubmatch(out)
	if ref == nil {
		t.Fatalf("no link ref:\n%s", out)
	}

	s, done, err := a.acquire(id)
	if err != nil {
		t.Fatal(err)
	}
	el, err := s.target(context.Background(), "@"+ref[1])
	if err != nil {
		done()
		t.Fatal(err)
	}
	if href, _ := el.Attribute("href"); href == nil || *href != "/two" {
		t.Errorf("ref resolved to the wrong element (href %v)", href)
	}
	for _, sel := range []string{"text=Next page", "xpath=//nav/a", "nav a"} {
		if el, err := s.target(context.Background(), sel); err != nil || el.MustText() != "Next page" {
			t.Errorf("target %q: %v", sel, err)
		}
	}
	done()

	runOK(t, a, "-s "+id+" open "+srv.URL+"/two")
	s, done, _ = a.acquire(id)
	defer done()
	_, err = s.target(context.Background(), "@"+ref[1])
	if want := `ref @` + ref[1] + ` not found; run "browser -s ` + id + ` snapshot" again`; err == nil || err.Error() != want {
		t.Fatalf("stale ref err = %v", err)
	}
}
