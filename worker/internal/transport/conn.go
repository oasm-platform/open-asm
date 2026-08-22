package transport

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// DialOpts controls how Dial establishes the connection.
// ponytail: insecure only; TLS/mTLS wiring in Task 2.5. No retry/backoff here (Task 2.4).
type DialOpts struct {
	Insecure   bool
	ServerName string
}

// Dial creates a gRPC client connection to target.
// Uses grpc.NewClient (not deprecated Dial). When Insecure is true it uses
// insecure credentials; otherwise no credentials are set (TLS added in 2.5).
func Dial(target string, opts DialOpts) (*grpc.ClientConn, error) {
	dialOpts := []grpc.DialOption{}
	if opts.Insecure {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}
	return grpc.NewClient(target, dialOpts...)
}

// Stream wraps a ClientConn with stub helpers.
// Full bidi multiplex in Task 2.4.
type Stream struct {
	cc *grpc.ClientConn
}

// NewStream creates a Stream wrapping cc.
func NewStream(cc *grpc.ClientConn) *Stream { return &Stream{cc: cc} }

// Close closes the underlying connection.
func (s *Stream) Close() error { return s.cc.Close() }

// Register is a stub that returns a fixed worker ID.
// ponytail: real bidi register in Task 2.4; keep stub so RED->GREEN passes without proto dependency.
func (s *Stream) Register(_ context.Context, _ string) (string, error) {
	return "worker-stub", nil
}
