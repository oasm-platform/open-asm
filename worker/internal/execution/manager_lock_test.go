package execution

// W1 lock-scope regression tests: Submit must not hold m.mu across
// rt.Create/rt.Start (image pull can take minutes). While a Create is in
// flight, Cancel and other m.mu consumers (ActiveCount, Release, Inspect)
// must make progress.

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// slowCreateRuntime blocks inside Create until release is closed, holding the
// window where the manager lock must be free.
type slowCreateRuntime struct {
	*runtime.FakeRuntime
	entered    chan struct{}
	enteredOne sync.Once
	release    chan struct{}
}

func (s *slowCreateRuntime) Create(ctx context.Context, spec runtime.JobSpec, opts runtime.RuntimeOpts) (runtime.Handle, error) {
	s.enteredOne.Do(func() { close(s.entered) })
	<-s.release
	return s.FakeRuntime.Create(ctx, spec, opts)
}

// Submit with a slow Create must not block a concurrent Cancel: the manager
// lock is narrowed to the spec-build section, so Cancel proceeds (returning
// "not found" while the execution is still being created) instead of
// deadlocking behind the image pull.
func TestSubmitSlowCreateDoesNotBlockCancel(t *testing.T) {
	rt := &slowCreateRuntime{
		FakeRuntime: runtime.NewFakeRuntime(),
		entered:     make(chan struct{}),
		release:     make(chan struct{}),
	}
	m := NewManager(rt, 0)

	submitErr := make(chan error, 1)
	go func() {
		_, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
		submitErr <- err
	}()
	<-rt.entered // Create in flight (lock must be released by now)

	cancelDone := make(chan error, 1)
	go func() { cancelDone <- m.Cancel(context.Background(), "exec-1") }()
	select {
	case <-cancelDone:
		// "not found" is acceptable: the execution registers only after
		// Create+Start complete. What matters is that Cancel returns instead
		// of blocking on the lock held across rt.Create.
	case <-time.After(2 * time.Second):
		close(rt.release)
		t.Fatal("Submit holds the manager lock across rt.Create: Cancel blocked (lock scope not narrowed)")
	}
	close(rt.release)
	if err := <-submitErr; err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if m.ActiveCount() != 1 {
		t.Fatalf("ActiveCount = %d, want 1 after Submit completes", m.ActiveCount())
	}
	if err := m.Cancel(context.Background(), "exec-1"); err != nil {
		t.Fatalf("Cancel after Submit: %v", err)
	}
}

// While Create is in flight, lock-taking readers (ActiveCount) must also
// return promptly — the same narrowed-scope contract from the read side.
func TestSubmitSlowCreateDoesNotBlockActiveCount(t *testing.T) {
	rt := &slowCreateRuntime{
		FakeRuntime: runtime.NewFakeRuntime(),
		entered:     make(chan struct{}),
		release:     make(chan struct{}),
	}
	m := NewManager(rt, 0)

	submitErr := make(chan error, 1)
	go func() {
		_, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
		submitErr <- err
	}()
	<-rt.entered

	countDone := make(chan int, 1)
	go func() { countDone <- m.ActiveCount() }()
	select {
	case <-countDone:
	case <-time.After(2 * time.Second):
		close(rt.release)
		t.Fatal("Submit holds the manager lock across rt.Create: ActiveCount blocked")
	}
	close(rt.release)
	if err := <-submitErr; err != nil {
		t.Fatalf("Submit: %v", err)
	}
}

// maxConcurrency admission must stay exact under the narrowed lock: a slot is
// reserved when the spec is built (before Create), so a second concurrent
// Submit is refused instead of overshooting the cap while the first Create is
// in flight.
func TestManagerMaxConcurrencyReservedDuringCreate(t *testing.T) {
	rt := &slowCreateRuntime{
		FakeRuntime: runtime.NewFakeRuntime(),
		entered:     make(chan struct{}),
		release:     make(chan struct{}),
	}
	m := NewManager(rt, 1)

	submitErr := make(chan error, 1)
	go func() {
		_, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
		submitErr <- err
	}()
	<-rt.entered // first Submit's Create in flight

	_, err := m.Submit(context.Background(), JobSpec{Tool: "nuclei", Image: "ghcr.io/open-asm/nuclei:1.0.0"})
	if err == nil {
		close(rt.release)
		t.Fatal("second Submit must be refused while the first Create reserves the only slot")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "max concurrency") {
		t.Fatalf("expected max concurrency error, got %v", err)
	}
	close(rt.release)
	if err := <-submitErr; err != nil {
		t.Fatalf("first Submit: %v", err)
	}
}
