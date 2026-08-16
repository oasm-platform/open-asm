package client

import (
	"context"
	"fmt"
	"sync/atomic"

	jobs_registry "github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
	workers "github.com/oasm-platform/open-asm/grpc-client/go/workers"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

// workerTokenHeader is the metadata key core-api's guard reads to
// authenticate workers (mirrors WORKER_TOKEN_HEADER in app.constants.ts).
const workerTokenHeader = "worker-token"

// Client is the gRPC client used by worker-node to talk to core-api.
// The token is dynamic (it arrives from the Join response), so it is held
// in an atomic.Value and injected per-call by the interceptors below.
type Client struct {
	conn   *grpc.ClientConn
	workers.WorkersServiceClient
	jobs_registry.JobsRegistryServiceClient
	token *atomic.Value
}

// New dials core-api's gRPC server (plaintext) and wraps the generated
// service clients with the token-injecting interceptors. opts are appended
// to the fixed dial options (e.g. a bufconn context dialer in tests).
func New(host string, port int, opts ...grpc.DialOption) (*Client, error) {
	addr := fmt.Sprintf("%s:%d", host, port)

	token := &atomic.Value{}
	dialOpts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(tokenUnaryInterceptor(token)),
		grpc.WithStreamInterceptor(tokenStreamInterceptor(token)),
	}
	dialOpts = append(dialOpts, opts...)
	conn, err := grpc.NewClient(addr, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("dial grpc server %s: %w", addr, err)
	}

	return &Client{
		conn:                      conn,
		WorkersServiceClient:      workers.NewWorkersServiceClient(conn),
		JobsRegistryServiceClient: jobs_registry.NewJobsRegistryServiceClient(conn),
		token:                     token,
	}, nil
}

// SetToken stores the worker token to attach to subsequent RPCs.
func (c *Client) SetToken(t string) {
	c.token.Store(t)
}

// Close closes the underlying connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// tokenUnaryInterceptor appends the worker-token metadata header to every
// unary RPC when a token has been set.
func tokenUnaryInterceptor(token *atomic.Value) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		ctx = withToken(ctx, token)
		return invoker(ctx, method, req, reply, cc, opts...)
	}
}

// tokenStreamInterceptor appends the worker-token metadata header to every
// streaming RPC when a token has been set.
func tokenStreamInterceptor(token *atomic.Value) grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		ctx = withToken(ctx, token)
		return streamer(ctx, desc, cc, method, opts...)
	}
}

// withToken returns a context whose outgoing metadata includes the
// worker-token header, if a non-empty token is set.
func withToken(ctx context.Context, token *atomic.Value) context.Context {
	if t, ok := token.Load().(string); ok && t != "" {
		ctx = metadata.AppendToOutgoingContext(ctx, workerTokenHeader, t)
	}
	return ctx
}
