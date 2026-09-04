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

	// InspectFn overrides Inspect results (nil = default {Running:false}).
	InspectFn    func() InspectResult
	inspectCount int
	// LogLines is replayed by Logs before the stream holds for ctx cancel.
	LogLines [][]byte
}

func NewFakeRuntime() *FakeRuntime {
	return &FakeRuntime{handles: map[string]Handle{}}
}

func (f *FakeRuntime) SetInspectFn(fn func() InspectResult) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.InspectFn = fn
}

func (f *FakeRuntime) SetLogLines(lines [][]byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.LogLines = lines
}

func (f *FakeRuntime) InspectCallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.inspectCount
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
	f.mu.Lock()
	f.inspectCount++
	fn := f.InspectFn
	f.mu.Unlock()
	if fn != nil {
		return fn(), nil
	}
	return InspectResult{Running: false}, nil
}

func (f *FakeRuntime) Logs(ctx context.Context, _ Handle) (<-chan []byte, error) {
	f.mu.Lock()
	lines := append([][]byte(nil), f.LogLines...)
	f.mu.Unlock()
	ch := make(chan []byte, len(lines))
	go func() {
		defer close(ch)
		for _, l := range lines {
			cp := append([]byte(nil), l...)
			select {
			case ch <- cp:
			case <-ctx.Done():
				return
			}
		}
		// Follow semantics: hold the stream open until the consumer cancels.
		<-ctx.Done()
	}()
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
