package observability

import (
	"context"
	"testing"
)

func TestWithTraceAndTraceFrom(t *testing.T) {
	ctx := context.Background()
	if got := TraceFrom(ctx); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	ctx2 := WithTrace(ctx, "trace-abc-123")
	if got := TraceFrom(ctx2); got != "trace-abc-123" {
		t.Fatalf("expected trace-abc-123, got %q", got)
	}
	// isolation: original ctx unchanged
	if got := TraceFrom(ctx); got != "" {
		t.Fatalf("original ctx should stay empty, got %q", got)
	}
}

func TestTraceFromEmptyString(t *testing.T) {
	ctx := WithTrace(context.Background(), "")
	if got := TraceFrom(ctx); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}
