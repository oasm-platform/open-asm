package grpcclient

import (
	"context"
	"sync"
)

// workerTokenHeader is the metadata key the server's GrpcWorkerTokenGuard
// reads to authenticate workers (core-api WORKER_TOKEN_HEADER).
const workerTokenHeader = "worker-token"

// tokenAuth implements credentials.PerRPCCredentials, attaching the current
// worker token to every outgoing RPC under the worker-token header.
type tokenAuth struct {
	mu    sync.RWMutex
	token string
}

// GetRequestMetadata returns the worker token as per-RPC metadata.
func (a *tokenAuth) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.token == "" {
		return nil, nil
	}
	return map[string]string{workerTokenHeader: a.token}, nil
}

// RequireTransportSecurity reports whether the credentials require a secure
// connection. The server runs plaintext gRPC, so this returns false.
func (a *tokenAuth) RequireTransportSecurity() bool { return false }

// setToken updates the token used for subsequent RPCs.
func (a *tokenAuth) setToken(t string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.token = t
}

// currentToken returns the token currently attached to RPCs.
func (a *tokenAuth) currentToken() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.token
}
