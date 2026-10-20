package worker

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"testing"

	"github.com/go-rod/rod"
)

// newTestBrowsers gives a test its own agent Chromium, or skips the test
// where none can launch.
func newTestBrowsers(t *testing.T) *agentBrowsers {
	t.Helper()
	log := NewTuiLogger(nil, "test")
	b, l, err := launchBrowser(log)
	if err != nil {
		t.Skipf("chromium unavailable: %v", err)
	}
	a := newAgentBrowsers(log, func() (*rod.Browser, func(), error) {
		return b, func() { _ = b.Close(); l.Kill(); l.Cleanup() }, nil
	})
	t.Cleanup(a.shutdown)
	return a
}

func TestNewBrowserSessionIDFormat(t *testing.T) {
	id := newBrowserSessionID()
	if !regexp.MustCompile(`^b-[0-9a-f]{32}$`).MatchString(id) || id == newBrowserSessionID() {
		t.Fatalf("bad or repeated id %q", id)
	}
}

func TestAcquireUnknownSessionIsNotFound(t *testing.T) {
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) {
		t.Fatal("must not launch")
		return nil, nil, nil
	})
	_, _, err := a.acquire("b-0")
	if err == nil || !strings.Contains(err.Error(), `browser session b-0 not found (expired or worker restarted); run "browser open <url>" again`) {
		t.Fatalf("err = %v", err)
	}
	if len(a.list()) != 0 {
		t.Fatal("acquire must not create a session")
	}
}

func TestOpenReportsLaunchFailure(t *testing.T) {
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) { return nil, nil, errors.New("no chromium") })
	if _, _, err := a.open(nil); err == nil || !strings.Contains(err.Error(), "no chromium") {
		t.Fatalf("err = %v", err)
	}
	if len(a.list()) != 0 {
		t.Fatal("failed open must not leave a session")
	}
}

func TestRingLogKeepsLastLines(t *testing.T) {
	var r ringLog
	for i := range browserLogCap + 5 {
		r.add(fmt.Sprint(i))
	}
	got := r.list("")
	if len(got) != browserLogCap || got[0] != "5" {
		t.Fatalf("len=%d first=%q", len(got), got[0])
	}
	if f := r.list("19"); len(f) == 0 || !strings.Contains(f[0], "19") {
		t.Fatalf("filter = %q", f)
	}
	r.clear()
	if len(r.list("")) != 0 {
		t.Fatal("clear")
	}
}

func TestSessionCapAndCloseFreesSlot(t *testing.T) {
	a := newTestBrowsers(t)
	var first *browserSession
	for i := range maxBrowserSessions {
		s, done, err := a.open(nil)
		if err != nil {
			t.Fatalf("open %d: %v", i, err)
		}
		if first == nil {
			first = s
		}
		done()
	}
	if _, _, err := a.open(nil); err == nil || !strings.Contains(err.Error(), "too many browser sessions") {
		t.Fatalf("want cap error, got %v", err)
	}

	s, done, err := a.acquire(first.id)
	if err != nil {
		t.Fatal(err)
	}
	s.shutdown()
	done()
	if _, _, err := a.acquire(first.id); err == nil {
		t.Fatal("closed session must be gone")
	}
	_, done, err = a.open(nil)
	if err != nil {
		t.Fatalf("closing a session must free its slot: %v", err)
	}
	done()
}
