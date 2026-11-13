package execution

import (
	"context"
	"testing"
	"time"
)

// gcEgressTokens must be reachable from the sweep path: simulate
// SweepLoop tick semantics — sweep + GC drops the adopted token but keeps
// the creator token while its container lives.
func TestSweepTickRunsTokenGC(t *testing.T) {
	m := newEgressManager()
	ctx := context.Background()
	id1, _ := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	tok1, _ := m.ExecToken(id1)
	if err := m.Release(ctx, id1); err != nil {
		t.Fatal(err)
	}
	id2, _ := m.Submit(ctx, JobSpec{Tool: "nuclei", Image: "img:x"})
	tok2, _ := m.ExecToken(id2)
	if err := m.Release(ctx, id2); err != nil {
		t.Fatal(err)
	}
	// Simulate one SweepLoop tick: sweep (nothing due) + GC.
	for _, e := range m.pool.Sweep(time.Now()) {
		m.sweepContainer(e)
	}
	m.gcEgressTokens()
	if _, ok := m.ProxyAuth(tok2); ok {
		t.Fatal("sweep-tick GC must drop released adopted token")
	}
	if _, ok := m.ProxyAuth(tok1); !ok {
		t.Fatal("sweep-tick GC must keep the pooled creator token")
	}
}
