package hostmetrics

import (
	"runtime"
	"testing"
)

func TestGetReportsProcessAndHostMetrics(t *testing.T) {
	first := Get()
	second := Get()

	if first.Timestamp.IsZero() || second.Timestamp.Before(first.Timestamp) {
		t.Fatalf("expected monotonic sample timestamps: first=%v second=%v", first.Timestamp, second.Timestamp)
	}
	if first.GoRoutines < 1 || second.GoRoutines < 1 {
		t.Fatalf("expected goroutine counts, got %d and %d", first.GoRoutines, second.GoRoutines)
	}
	if second.HeapAlloc < uint64(runtime.NumGoroutine()) {
		t.Fatal("expected a plausible Go heap allocation")
	}
}
