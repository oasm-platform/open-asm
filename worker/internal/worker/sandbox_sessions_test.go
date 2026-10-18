package worker

import (
	"sync"
	"testing"
	"time"
)

type releaseRecorder struct {
	mu  sync.Mutex
	ids []string
}

func (r *releaseRecorder) release(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ids = append(r.ids, id)
}

func (r *releaseRecorder) released() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.ids...)
}

func waitUntil(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestSandboxSessions_ReleasesAnIdleSession(t *testing.T) {
	rec := &releaseRecorder{}
	s := newSandboxSessions(20*time.Millisecond, 4, rec.release)

	if ok, isNew := s.begin("a"); !ok || !isNew {
		t.Fatalf("begin = %v, %v; want ok and new", ok, isNew)
	}
	s.end("a")

	waitUntil(t, func() bool { return len(rec.released()) == 1 })
	if got := rec.released()[0]; got != "a" {
		t.Fatalf("released %q, want a", got)
	}
}

func TestSandboxSessions_KeepsASessionWhileACommandRuns(t *testing.T) {
	rec := &releaseRecorder{}
	s := newSandboxSessions(20*time.Millisecond, 4, rec.release)

	s.begin("a")
	s.begin("a") // a second command of the same session
	s.end("a")

	time.Sleep(60 * time.Millisecond)
	if got := rec.released(); len(got) != 0 {
		t.Fatalf("released %v while a command still runs", got)
	}

	s.end("a")
	waitUntil(t, func() bool { return len(rec.released()) == 1 })
}

func TestSandboxSessions_ANewCommandCancelsTheIdleRelease(t *testing.T) {
	rec := &releaseRecorder{}
	s := newSandboxSessions(30*time.Millisecond, 4, rec.release)

	s.begin("a")
	s.end("a")
	if ok, isNew := s.begin("a"); !ok || isNew {
		t.Fatalf("begin = %v, %v; want ok and existing", ok, isNew)
	}

	time.Sleep(80 * time.Millisecond)
	if got := rec.released(); len(got) != 0 {
		t.Fatalf("released %v although the session was reused", got)
	}
}

func TestSandboxSessions_CapsLiveSessions(t *testing.T) {
	s := newSandboxSessions(time.Hour, 2, func(string) {})

	s.begin("a")
	s.begin("b")
	if ok, _ := s.begin("c"); ok {
		t.Fatal("a third session was allowed over the cap of 2")
	}
	// A running session can still take more commands
	if ok, _ := s.begin("a"); !ok {
		t.Fatal("an existing session was refused at the cap")
	}
}

func TestSandboxSessions_CloseAllReleasesEverything(t *testing.T) {
	rec := &releaseRecorder{}
	s := newSandboxSessions(time.Hour, 4, rec.release)

	s.begin("a")
	s.begin("b")
	s.end("b")
	s.closeAll()

	if got := rec.released(); len(got) != 2 {
		t.Fatalf("released %v, want both sessions", got)
	}
	if ok, isNew := s.begin("a"); !ok || !isNew {
		t.Fatal("a session was not new again after closeAll")
	}
}
