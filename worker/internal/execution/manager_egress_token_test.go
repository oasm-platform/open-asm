package execution

import (
	"context"
	"testing"
	"time"

	"oasm-worker/internal/runtime"
)

// fakeRT is a minimal ExecutionRuntime for token-lifetime tests.
type fakeEgressRT struct {
	createFn func(ctx context.Context, spec runtime.JobSpec, opts runtime.RuntimeOpts) (runtime.Handle, error)
}

func (f *fakeEgressRT) Create(ctx context.Context, spec runtime.JobSpec, opts runtime.RuntimeOpts) (runtime.Handle, error) {
	if f.createFn != nil {
		return f.createFn(ctx, spec, opts)
	}
	return runtime.Handle{ID: "c-1", Name: "c-1"}, nil
}
func (f *fakeEgressRT) Start(ctx context.Context, h runtime.Handle) error   { return nil }
func (f *fakeEgressRT) Stop(ctx context.Context, h runtime.Handle) error    { return nil }
func (f *fakeEgressRT) Cancel(ctx context.Context, h runtime.Handle) error  { return nil }
func (f *fakeEgressRT) Cleanup(ctx context.Context, h runtime.Handle) error { return nil }
func (f *fakeEgressRT) Inspect(ctx context.Context, h runtime.Handle) (runtime.InspectResult, error) {
	return runtime.InspectResult{}, nil
}
func (f *fakeEgressRT) Logs(ctx context.Context, h runtime.Handle) (<-chan []byte, error) {
	ch := make(chan []byte)
	close(ch)
	return ch, nil
}

func newEgressManager() *Manager {
	m := NewManager(&fakeEgressRT{}, 0)
	pool := NewPoolManager(time.Minute, 4, 1)
	m.SetPool(pool)
	return m
}

// Creator token survives Release-to-idle and authenticates proxy traffic;
// the adopted execution's own token is dropped by GC.
func TestProxyAuthSurvivesPoolReuse(t *testing.T) {
	m := newEgressManager()
	ctx := context.Background()
	id1, err := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	if err != nil {
		t.Fatalf("submit 1: %v", err)
	}
	tok1, ok := m.ExecToken(id1)
	if !ok {
		t.Fatal("creator token missing after submit")
	}
	if err := m.Release(ctx, id1); err != nil {
		t.Fatalf("release 1: %v", err)
	}
	if label, ok := m.ProxyAuth(tok1); !ok || label == "" {
		t.Fatal("creator token must still authenticate after release-to-idle")
	}
	// Adopted execution reuses the container; its own token dies by GC.
	id2, err := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	if err != nil {
		t.Fatalf("submit 2: %v", err)
	}
	tok2, _ := m.ExecToken(id2)
	if tok2 == "" {
		t.Skip("adopted execution shares creator token (alt design)")
	}
	// While the adopted execution is live its own token authenticates too.
	if _, ok := m.ProxyAuth(tok2); !ok {
		t.Fatal("adopted execution token must authenticate while live")
	}
	if err := m.Release(ctx, id2); err != nil {
		t.Fatalf("release 2: %v", err)
	}
	m.gcEgressTokens()
	if _, ok := m.ProxyAuth(tok2); ok {
		t.Fatal("adopted execution token must be dropped by GC after release")
	}
	if _, ok := m.ProxyAuth(tok1); !ok {
		t.Fatal("creator token must survive GC while its container lives")
	}
}

// Cancel and ContainerDown delete both exec and creator tokens.
func TestProxyAuthDiesOnCancelOrDown(t *testing.T) {
	m := newEgressManager()
	ctx := context.Background()
	id, err := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	tok, _ := m.ExecToken(id)
	if err := m.Cancel(ctx, id); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if _, ok := m.ProxyAuth(tok); ok {
		t.Fatal("token must die with Cancel")
	}

	id2, err := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	if err != nil {
		t.Fatalf("submit 2: %v", err)
	}
	tok2, _ := m.ExecToken(id2)
	m.ContainerDown(id2)
	if _, ok := m.ProxyAuth(tok2); ok {
		t.Fatal("token must die with ContainerDown")
	}
}

// Pool-disabled Release deletes immediately (legacy 1:1 path).
func TestProxyAuthLegacyReleaseDeletes(t *testing.T) {
	m := NewManager(&fakeEgressRT{}, 0)
	ctx := context.Background()
	id, err := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	tok, _ := m.ExecToken(id)
	if err := m.Release(ctx, id); err != nil {
		t.Fatalf("release: %v", err)
	}
	if _, ok := m.ProxyAuth(tok); ok {
		t.Fatal("pool-disabled release must delete the token immediately")
	}
}
