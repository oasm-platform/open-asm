//go:build windows

package hostmetrics

import "testing"

func TestGetReadsWindowsPhysicalMemory(t *testing.T) {
	metrics := Get()
	if metrics.MemoryTotal == 0 {
		t.Fatal("expected Windows physical memory total")
	}
	if metrics.MemoryUsed > metrics.MemoryTotal {
		t.Fatalf("memory used %d exceeds total %d", metrics.MemoryUsed, metrics.MemoryTotal)
	}
	if metrics.MemoryPct < 0 || metrics.MemoryPct > 100 {
		t.Fatalf("unexpected memory percentage: %f", metrics.MemoryPct)
	}
}
