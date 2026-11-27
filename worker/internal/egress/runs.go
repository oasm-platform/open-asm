package egress

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// RunCredentials holds the proxy tokens of agent remote commands running on
// the worker host. Each command gets its own token so the proxy can tell
// which agent session a request belongs to, and the token is revoked when
// the command exits so lingering background children lose proxy access.
type RunCredentials struct {
	mu     sync.Mutex
	tokens map[string]string // token -> session id
}

func NewRunCredentials() *RunCredentials {
	return &RunCredentials{tokens: make(map[string]string)}
}

// Issue mints a token for one command of sessionID. revoke is idempotent.
func (r *RunCredentials) Issue(sessionID string) (token string, revoke func()) {
	var b [32]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read never fails (Go 1.24+)
	token = hex.EncodeToString(b[:])
	r.mu.Lock()
	r.tokens[token] = sessionID
	r.mu.Unlock()
	return token, func() {
		r.mu.Lock()
		delete(r.tokens, token)
		r.mu.Unlock()
	}
}

// Lookup resolves a token to its session id.
func (r *RunCredentials) Lookup(token string) (sessionID string, ok bool) {
	if token == "" {
		return "", false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	sessionID, ok = r.tokens[token]
	return sessionID, ok
}
