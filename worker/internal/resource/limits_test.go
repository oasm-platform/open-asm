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

func TestValidateLimitsRejectsZeroTimeout(t *testing.T) {
	l := Limits{CPU: "500m", Memory: "512Mi", TimeoutSeconds: 0}
	if err := ValidateLimits(l); err == nil {
		t.Fatal("expected error for zero timeout")
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
