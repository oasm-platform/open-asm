package runtime

import (
	"context"
	"errors"
	"testing"

	"github.com/docker/docker/api/types/system"
)

// Phase 1 shipped a unit bug: resource.ToRuntimeOpts returns Memory in BYTES
// (512Mi -> 536870912) but docker.go multiplied it by 1024*1024 again, turning
// a 512Mi job into a ~512Gi container limit. The fix centralizes the mapping
// in hostResources: NanoCPUs from millicores (1 millicore = 1e6 nanocpus) and
// Memory/MemorySwap passed through verbatim (bytes).
func TestHostResourcesConvertsMillicoresToNanoCPUs(t *testing.T) {
	got := hostResources(RuntimeOpts{CPU: 500, Memory: 536870912, TimeoutSeconds: 600, TraceID: "t"}, false)
	// 500m -> 500000000 nanocpus; 512Mi in bytes passed through unchanged;
	// MemorySwap == Memory disables swap.
	if got.NanoCPUs != 500*1e6 {
		t.Fatalf("NanoCPUs = %d, want %d (500m)", got.NanoCPUs, int64(500*1e6))
	}
	if got.Memory != 536870912 {
		t.Fatalf("Memory = %d, want 536870912 (512Mi bytes)", got.Memory)
	}
	if got.MemorySwap != 536870912 {
		t.Fatalf("MemorySwap = %d, want 536870912", got.MemorySwap)
	}
}

func TestHostResourcesMemoryBytesNotReMultiplied(t *testing.T) {
	// Regression lock for the Phase 1 unit bug: bytes must reach HostConfig
	// unchanged, NOT multiplied by 1024*1024.
	got := hostResources(RuntimeOpts{CPU: 500, Memory: 536870912}, false)
	if got.Memory != 536870912 {
		t.Fatalf("Memory must pass through as bytes, got %d (want 536870912)", got.Memory)
	}
	if got.MemorySwap != 536870912 {
		t.Fatalf("MemorySwap must equal Memory, got %d", got.MemorySwap)
	}
}

func TestHostResourcesZeroIsUnlimited(t *testing.T) {
	got := hostResources(RuntimeOpts{}, false)
	if got.NanoCPUs != 0 || got.Memory != 0 || got.MemorySwap != 0 {
		t.Fatalf("all-zero limits must stay zero (unlimited), got %+v", got)
	}
}

// Issue #734: daemons without CPU CFS quota (Synology DSM, some cgroup
// setups) reject any NanoCPUs value, so it must be left at zero there.
func TestHostResourcesSkipsNanoCPUsWithoutCFS(t *testing.T) {
	got := hostResources(RuntimeOpts{CPU: 500, Memory: 536870912}, true)
	if got.NanoCPUs != 0 {
		t.Fatalf("NanoCPUs = %d, want 0 without CFS quota", got.NanoCPUs)
	}
	if got.Memory != 536870912 || got.MemorySwap != 536870912 {
		t.Fatalf("memory limits must still apply, got %+v", got)
	}
}

type fakeInfoer struct {
	info system.Info
	err  error
}

func (f fakeInfoer) Info(context.Context) (system.Info, error) { return f.info, f.err }

func TestDetectCPUQuotaUnsupported(t *testing.T) {
	if !detectCPUQuotaUnsupported(context.Background(), fakeInfoer{info: system.Info{CPUCfsQuota: false}}) {
		t.Fatal("CPUCfsQuota=false must report unsupported")
	}
	if detectCPUQuotaUnsupported(context.Background(), fakeInfoer{info: system.Info{CPUCfsQuota: true}}) {
		t.Fatal("CPUCfsQuota=true must report supported")
	}
}

func TestDetectCPUQuotaUnsupportedInfoError(t *testing.T) {
	// Unknown host capability keeps today's behaviour: CPU limit applied.
	if detectCPUQuotaUnsupported(context.Background(), fakeInfoer{err: errors.New("boom")}) {
		t.Fatal("Info error must not disable CPU limits")
	}
}
