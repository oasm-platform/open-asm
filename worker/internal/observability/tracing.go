package observability

import "context"

type ctxKey string

const traceKey ctxKey = "trace_id"

func WithTrace(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, traceKey, traceID)
}

func TraceFrom(ctx context.Context) string {
	v, _ := ctx.Value(traceKey).(string)
	return v
}
