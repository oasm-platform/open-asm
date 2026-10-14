package config

import "testing"

func TestAutoConcurrency_ClampsByCPUAndMemory(t *testing.T) {
	const (
		MiB = uint64(1) << 20
		GiB = uint64(1) << 30
	)
	cases := []struct {
		name string
		cpus int
		mem  uint64
		want int
	}{
		{"cpu bound", 8, 16 * GiB, 8},
		{"memory bound", 8, 1600 * MiB, 3},
		{"two cores", 2, 8 * GiB, 2},
		{"zero cpu floors to one", 0, 8 * GiB, 1},
		{"capped at max", 64, 128 * GiB, AutoConcurrencyMax},
		{"tiny memory floors to one", 8, 0, 1},
		{"negative cpu floors to one", -4, 8 * GiB, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := autoConcurrency(tc.cpus, tc.mem); got != tc.want {
				t.Fatalf("autoConcurrency(%d, %d) = %d, want %d", tc.cpus, tc.mem, got, tc.want)
			}
		})
	}
}

// An explicit operator value must always win over auto-detection.
func TestResolveMaxConcurrency_ExplicitOverrideWins(t *testing.T) {
	for _, configured := range []int{1, 4, 100} {
		if got := ResolveMaxConcurrency(configured); got != configured {
			t.Fatalf("explicit max concurrency %d must be honoured, got %d", configured, got)
		}
	}
}

// 0 / negative means "auto": the result must be a sane positive value.
func TestResolveMaxConcurrency_AutoWhenUnset(t *testing.T) {
	for _, configured := range []int{0, -1} {
		got := ResolveMaxConcurrency(configured)
		if got < 1 || got > AutoConcurrencyMax {
			t.Fatalf("auto concurrency for configured=%d = %d, want within [1, %d]", configured, got, AutoConcurrencyMax)
		}
	}
}

// The semaphore is built from MaxConcurrency; a non-positive value would produce
// an unbuffered channel and stall every job, so LoadConfig must always resolve a
// positive number.
func TestLoadConfigMaxConcurrencyIsResolvedPositive(t *testing.T) {
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.MaxConcurrency < 1 {
		t.Fatalf("max_concurrency must resolve to a positive value, got %d", cfg.MaxConcurrency)
	}
}
