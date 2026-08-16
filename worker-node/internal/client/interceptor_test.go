package client

import (
	"context"
	"sync/atomic"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// captureCtx is a fake invoker/streamer that records the context it was
// called with.
type captureCtx struct {
	ctx context.Context
}

func (c *captureCtx) invoke(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, opts ...grpc.CallOption) error {
	c.ctx = ctx
	return nil
}

func (c *captureCtx) stream(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, opts ...grpc.CallOption) (grpc.ClientStream, error) {
	c.ctx = ctx
	return nil, nil
}

func outgoingToken(ctx context.Context) (string, bool) {
	md, ok := metadata.FromOutgoingContext(ctx)
	if !ok {
		return "", false
	}
	vals := md.Get(workerTokenHeader)
	if len(vals) == 0 {
		return "", false
	}
	return vals[0], true
}

func TestTokenInterceptor(t *testing.T) {
	var token atomic.Value

	t.Run("unary with token", func(t *testing.T) {
		token.Store("tok")
		captured := &captureCtx{}
		interceptor := tokenUnaryInterceptor(&token)

		err := interceptor(context.Background(), "/workers.WorkersService/Join", nil, nil, nil, captured.invoke)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		got, ok := outgoingToken(captured.ctx)
		if !ok {
			t.Fatal("expected worker-token in outgoing metadata, got none")
		}
		if got != "tok" {
			t.Fatalf("expected worker-token %q, got %q", "tok", got)
		}
	})

	t.Run("unary without token", func(t *testing.T) {
		token.Store("")
		captured := &captureCtx{}
		interceptor := tokenUnaryInterceptor(&token)

		err := interceptor(context.Background(), "/workers.WorkersService/Join", nil, nil, nil, captured.invoke)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if _, ok := outgoingToken(captured.ctx); ok {
			t.Fatal("did not expect worker-token in outgoing metadata for empty token")
		}
	})

	t.Run("stream with token", func(t *testing.T) {
		token.Store("tok")
		captured := &captureCtx{}
		interceptor := tokenStreamInterceptor(&token)

		_, err := interceptor(context.Background(), &grpc.StreamDesc{}, nil, "/workers.WorkersService/Next", captured.stream)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		got, ok := outgoingToken(captured.ctx)
		if !ok {
			t.Fatal("expected worker-token in outgoing metadata, got none")
		}
		if got != "tok" {
			t.Fatalf("expected worker-token %q, got %q", "tok", got)
		}
	})

	t.Run("stream without token", func(t *testing.T) {
		token.Store("")
		captured := &captureCtx{}
		interceptor := tokenStreamInterceptor(&token)

		_, err := interceptor(context.Background(), &grpc.StreamDesc{}, nil, "/workers.WorkersService/Next", captured.stream)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if _, ok := outgoingToken(captured.ctx); ok {
			t.Fatal("did not expect worker-token in outgoing metadata for empty token")
		}
	})
}
