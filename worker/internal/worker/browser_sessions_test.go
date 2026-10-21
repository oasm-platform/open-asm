package worker

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync/atomic"
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

// newSharedTestBrowsers is newTestBrowsers as on a sandboxed (shared) worker,
// or skips where Chromium ignores per-session proxies.
func newSharedTestBrowsers(t *testing.T) *agentBrowsers {
	t.Helper()
	a := newTestBrowsers(t)
	a.publicOnly = true
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.ensureBrowser(context.Background()); errors.Is(err, errBrowserUnavailable) {
		t.Skipf("chromium unusable on a shared worker: %v", err)
	}
	return a
}

func TestSharedWorkerSessionReachesOnlyPublicAddresses(t *testing.T) {
	a := newSharedTestBrowsers(t)
	var hit atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit.Store(true) }))
	defer srv.Close()

	// "open" refuses local hosts up front; a page's own requests and
	// navigations meet the proxy instead.
	s, done, err := a.open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer done()
	p, err := s.newTab(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	local := strings.Replace(srv.URL, "127.0.0.1", "localhost", 1)
	_ = p.Navigate(local + "/")
	if hit.Load() {
		t.Fatal("a shared worker's session reached a local server")
	}
	// localhost may dial ::1 or 127.0.0.1.
	if b := s.drainBlocked(); len(b) != 1 || !strings.HasPrefix(b[0], "BLOCKED GET "+local+"/ (") || !strings.Contains(b[0], "is not a public address") {
		t.Fatalf("blocked = %q", b)
	}
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
	if a.count() != 0 {
		t.Fatal("acquire must not create a session")
	}
}

func TestAcquireOfAnEndingSessionHoldsNoSlot(t *testing.T) {
	a := newAgentBrowsers(nil, nil)
	// Idle timer already fired: release is about to close it.
	a.sessions["b-1"] = &browserSession{id: "b-1"}
	// Closed by another command's "close", slot still idling.
	closed := &browserSession{id: "b-2"}
	closed.closed.Store(true)
	a.sessions["b-2"] = closed
	a.life.begin("b-2")
	a.life.end("b-2")

	for _, id := range []string{"b-1", "b-2"} {
		if _, _, err := a.acquire(id); err == nil || !strings.Contains(err.Error(), "not found") {
			t.Fatalf("%s: err = %v", id, err)
		}
	}
	a.life.mu.Lock()
	defer a.life.mu.Unlock()
	if n := len(a.life.live); n != 0 {
		t.Fatalf("%d slot(s) still held by sessions that are gone", n)
	}
}

func TestOpenReportsLaunchFailure(t *testing.T) {
	a := newAgentBrowsers(nil, func() (*rod.Browser, func(), error) { return nil, nil, errors.New("no chromium") })
	if _, _, err := a.open(context.Background()); err == nil || !strings.Contains(err.Error(), "no chromium") {
		t.Fatalf("err = %v", err)
	}
	if a.count() != 0 {
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
		s, done, err := a.open(context.Background())
		if err != nil {
			t.Fatalf("open %d: %v", i, err)
		}
		if first == nil {
			first = s
		}
		done()
	}
	if _, _, err := a.open(context.Background()); err == nil || !strings.Contains(err.Error(), "too many browser sessions") {
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
	_, done, err = a.open(context.Background())
	if err != nil {
		t.Fatalf("closing a session must free its slot: %v", err)
	}
	done()
}

func TestBrowserCrashFreesSessionSlots(t *testing.T) {
	log := NewTuiLogger(nil, "test")
	var kill func()
	a := newAgentBrowsers(log, func() (*rod.Browser, func(), error) {
		b, l, err := launchBrowser(log)
		if err != nil {
			return nil, nil, err
		}
		kill = l.Kill
		return b, func() { _ = b.Close(); l.Kill(); l.Cleanup() }, nil
	})
	t.Cleanup(a.shutdown)
	var ids []string
	for i := range maxBrowserSessions {
		s, done, err := a.open(context.Background())
		if i == 0 && errors.Is(err, errBrowserUnavailable) {
			t.Skipf("chromium unavailable: %v", err)
		}
		if err != nil {
			t.Fatalf("open %d: %v", i, err)
		}
		ids = append(ids, s.id)
		done()
	}

	kill() // Chromium dies under all live sessions
	_, done, err := a.open(context.Background())
	if err != nil {
		t.Fatalf("relaunch must free the dead sessions' slots: %v", err)
	}
	done()
	if _, _, err := a.acquire(ids[0]); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("dead session must be not found, got %v", err)
	}
}

func TestListWhileClosingIsRaceFree(t *testing.T) {
	a := newTestBrowsers(t)
	s, done, err := a.open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	stop := make(chan struct{})
	listed := make(chan struct{})
	go func() {
		defer close(listed)
		for {
			select {
			case <-stop:
				return
			default:
				a.count()
			}
		}
	}()
	s.shutdown() // what "close" does, holding s.mu
	done()
	close(stop)
	<-listed
}
