package runtime

import (
	"context"
	"fmt"
	"sync"
)

type FakeRuntime struct {
	mu          sync.Mutex
	handles     map[string]Handle
	CancelCalls []string
	CreateCount int
	CreateSpecs []JobSpec // captured specs from Create calls
}

func NewFakeRuntime() *FakeRuntime {
	return &FakeRuntime{handles: map[string]Handle{}}
}

func (f *FakeRuntime) Create(_ context.Context, spec JobSpec, _ RuntimeOpts) (Handle, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.CreateCount++
	f.CreateSpecs = append(f.CreateSpecs, spec)
	h := Handle{ID: fmt.Sprintf("fake-%d", f.CreateCount)}
	f.handles[h.ID] = h
	return h, nil
}

func (f *FakeRuntime) Start(_ context.Context, _ Handle) error { return nil }

func (f *FakeRuntime) Stop(_ context.Context, _ Handle) error { return nil }

func (f *FakeRuntime) Cancel(_ context.Context, h Handle) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.CancelCalls = append(f.CancelCalls, h.ID)
	return nil
}

func (f *FakeRuntime) Inspect(_ context.Context, _ Handle) (InspectResult, error) {
	return InspectResult{Running: false}, nil
}

func (f *FakeRuntime) Logs(_ context.Context, _ Handle) (<-chan []byte, error) {
	ch := make(chan []byte)
	close(ch)
	return ch, nil
}

func (f *FakeRuntime) Cleanup(_ context.Context, h Handle) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.handles, h.ID)
	return nil
}

func (f *FakeRuntime) CancelCallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.CancelCalls)
}
