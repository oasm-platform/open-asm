package resource

import "testing"

func TestValidateLimitsAcceptsValid(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "512Mi", TimeoutSeconds: 600}
	if err := ValidateLimits(l); err != nil {
		t.Fatalf("expected valid limits, got %v", err)
	}
}

func TestValidateLimitsRejectsInvalidMemory(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "bad", TimeoutSeconds: 600}
	if err := ValidateLimits(l); err == nil {
		t.Fatal("expected error for invalid memory")
	}
}

func TestValidateLimitsAcceptsZeroTimeout(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "512Mi", TimeoutSeconds: 0}
	if err := ValidateLimits(l); err != nil {
		t.Fatalf("timeout 0 (no job timeout) must be accepted, got %v", err)
	}
}

func TestValidateLimitsRejectsNegativeTimeout(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "512Mi", TimeoutSeconds: -1}
	if err := ValidateLimits(l); err == nil {
		t.Fatal("expected error for negative timeout")
	}
}

func TestParseMemoryToBytes(t *testing.T) {
	v, err := ParseMemoryToBytes("512Mi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 536870912 {
		t.Fatalf("expected 536870912, got %d", v)
	}
	v2, err := ParseMemoryToBytes("1Gi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v2 != 1073741824 {
		t.Fatalf("expected 1073741824, got %d", v2)
	}
}

func TestToRuntimeOptsPreservesTraceID(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "512Mi", TimeoutSeconds: 600}
	opts, err := ToRuntimeOpts(l, "trace-abc-123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if opts.TraceID != "trace-abc-123" {
		t.Fatalf("expected trace-abc-123, got %s", opts.TraceID)
	}
	if opts.CPU != 500 {
		t.Fatalf("expected CPU 500, got %d", opts.CPU)
	}
	if opts.Memory != 536870912 {
		t.Fatalf("expected Memory 536870912, got %d", opts.Memory)
	}
	if opts.TimeoutSeconds != 600 {
		t.Fatalf("expected TimeoutSeconds 600, got %d", opts.TimeoutSeconds)
	}
}

func TestParseCPU(t *testing.T) {
	v, err := ParseCPU("500m")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 500 {
		t.Fatalf("expected 500, got %d", v)
	}
}

func TestParseCPUPlainCores(t *testing.T) {
	one, err := ParseCPU("1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if one != 1000 {
		t.Fatalf("expected 1 core -> 1000 millicores, got %d", one)
	}
	half, err := ParseCPU("0.5")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if half != 500 {
		t.Fatalf("expected 0.5 core -> 500 millicores, got %d", half)
	}
}

func TestParseMemoryToBytesDecimalSuffixes(t *testing.T) {
	cases := map[string]int{
		"256Mi": 268435456,
		"512M":  512000000,
		"1G":    1000000000,
		"512K":  512000,
		"1Ki":   1024,
	}
	for input, want := range cases {
		got, err := ParseMemoryToBytes(input)
		if err != nil {
			t.Fatalf("ParseMemoryToBytes(%q) unexpected error: %v", input, err)
		}
		if got != want {
			t.Fatalf("ParseMemoryToBytes(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestParseMemoryToBytesBareBytes(t *testing.T) {
	got, err := ParseMemoryToBytes("123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 123 {
		t.Fatalf("expected 123 bytes, got %d", got)
	}
}

func TestValidateLimitsAcceptsMissingCPU(t *testing.T) {
	l := Limits{Memory: "512Mi", TimeoutSeconds: 600}
	if err := ValidateLimits(l); err != nil {
		t.Fatalf("CPU must be optional, got %v", err)
	}
}

func TestValidateLimitsRejectsEmptyMemory(t *testing.T) {
	l := Limits{CPU: "500m", TimeoutSeconds: 600}
	if err := ValidateLimits(l); err == nil {
		t.Fatal("expected error for empty memory")
	}
}

func TestParseCPURejectsInvalid(t *testing.T) {
	for _, input := range []string{"", "abc", "100x", "-5m", "-1"} {
		if _, err := ParseCPU(input); err == nil {
			t.Fatalf("expected error for cpu %q", input)
		}
	}
}

func TestParseMemoryToBytesRejectsInvalid(t *testing.T) {
	for _, input := range []string{"", "bad", "9999Zz", "1.5Gi", "-1"} {
		if _, err := ParseMemoryToBytes(input); err == nil {
			t.Fatalf("expected error for memory %q", input)
		}
	}
}

func TestToRuntimeOptsAcceptsMissingTimeout(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "512Mi"}
	opts, err := ToRuntimeOpts(l, "trace-x")
	if err != nil {
		t.Fatalf("missing timeout means no job timeout, got %v", err)
	}
	if opts.TimeoutSeconds != 0 {
		t.Fatalf("expected TimeoutSeconds 0, got %d", opts.TimeoutSeconds)
	}
	if opts.CPU != 500 || opts.Memory != 536870912 {
		t.Fatalf("CPU/mem must still be applied, got %+v", opts)
	}
}
