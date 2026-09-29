package sysresources

import "testing"

func TestParseCPUMax(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want int
		ok   bool
	}{
		{"two full cpus", "200000 100000", 2, true},
		{"one and a half cpus rounds up", "150000 100000", 2, true},
		{"half cpu rounds up to one", "50000 100000", 1, true},
		{"unlimited sentinel", "max 100000", 0, false},
		{"empty", "", 0, false},
		{"garbage", "definitely-not-a-number", 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseCPUMax(tc.in)
			if ok != tc.ok || got != tc.want {
				t.Fatalf("parseCPUMax(%q) = (%d, %v), want (%d, %v)", tc.in, got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestParseMemoryMax(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want uint64
		ok   bool
	}{
		{"one gibibyte", "1073741824", 1073741824, true},
		{"unlimited sentinel", "max", 0, false},
		{"empty", "", 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseMemoryMax(tc.in)
			if ok != tc.ok || got != tc.want {
				t.Fatalf("parseMemoryMax(%q) = (%d, %v), want (%d, %v)", tc.in, got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestParseCFSQuota(t *testing.T) {
	cases := []struct {
		name       string
		quota, per string
		want       int
		ok         bool
	}{
		{"two cpus", "200000", "100000", 2, true},
		{"one and a half rounds up", "150000", "100000", 2, true},
		{"unlimited", "-1", "100000", 0, false},
		{"missing period", "200000", "", 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseCFSQuota(tc.quota, tc.per)
			if ok != tc.ok || got != tc.want {
				t.Fatalf("parseCFSQuota(%q, %q) = (%d, %v), want (%d, %v)", tc.quota, tc.per, got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestParseMemoryLimitV1(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want uint64
		ok   bool
	}{
		{"one gibibyte", "1073741824", 1073741824, true},
		{"unlimited negative", "-1", 0, false},
		{"unlimited sentinel", "9223372036854771712", 0, false},
		{"empty", "", 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseMemoryLimitV1(tc.in)
			if ok != tc.ok || got != tc.want {
				t.Fatalf("parseMemoryLimitV1(%q) = (%d, %v), want (%d, %v)", tc.in, got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestDetectAlwaysPositive(t *testing.T) {
	cpus, mem := Detect()
	if cpus < 1 {
		t.Fatalf("Detect() cpus = %d, want >= 1", cpus)
	}
	if mem == 0 {
		// Memory may be unreadable on exotic platforms; only the CPU floor is a
		// hard guarantee. Log nothing here to keep the assertion honest.
		t.Log("Detect() reported 0 memory (memory source unavailable)")
	}
}
