package grpcclient

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	workers "oasm-worker/internal/gen/workers"
)

// callPlaintextServer dials a plaintext gRPC server with the given options and
// returns the status code of one RPC.
func callPlaintextServer(t *testing.T, opts ...grpc.DialOption) codes.Code {
	t.Helper()
	lis := bufconn.Listen(64 * 1024)
	srv := grpc.NewServer()
	workers.RegisterWorkersServiceServer(srv, &fakeWorkersService{})
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)

	opts = append([]grpc.DialOption{grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
		return lis.DialContext(ctx)
	})}, opts...)
	c, err := NewClient("key", "passthrough:///bufnet", "tools", &noOpLogger{}, opts...)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err = c.workers.Join(ctx, &workers.JoinRequest{})
	return status.Code(err)
}

// WithTLS must replace NewClient's default plaintext credentials: against a
// plaintext server the TLS handshake fails before any RPC reaches it.
func TestWithTLSOverridesPlaintextCredentials(t *testing.T) {
	if got := callPlaintextServer(t); got != codes.Unimplemented {
		t.Fatalf("plaintext dial: code = %v, want Unimplemented (RPC reached the server)", got)
	}
	if got := callPlaintextServer(t, WithTLS()); got != codes.Unavailable {
		t.Fatalf("TLS dial: code = %v, want Unavailable (handshake refused)", got)
	}
}
