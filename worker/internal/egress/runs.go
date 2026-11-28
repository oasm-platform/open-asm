package egress

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"sync"
)

// Run is one agent remote command: its own id (log flushes wait per command,
// not per session) and the agent session it belongs to.
type Run struct {
	ID, SessionID string
}

type runEntry struct {
	Run
	revoked bool
	conns   map[io.Closer]struct{}
}

// RunCredentials holds the proxy tokens of agent remote commands running on
// the worker host. Each command gets its own token so the proxy can tell
// which agent session a request belongs to, and the token is revoked when
// the command exits so lingering background children lose proxy access.
type RunCredentials struct {
	mu     sync.Mutex
	tokens map[string]*runEntry
}

func NewRunCredentials() *RunCredentials {
	return &RunCredentials{tokens: make(map[string]*runEntry)}
}

// Issue mints a token for one command of sessionID. revoke is idempotent and
// closes the connections still proxied under the token: a backgrounded
// child must not keep an open tunnel after the command exits.
func (r *RunCredentials) Issue(sessionID string) (token string, revoke func()) {
	var b [32]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read never fails (Go 1.24+)
	token = hex.EncodeToString(b[:])
	e := &runEntry{Run: Run{ID: NewEventID(), SessionID: sessionID}, conns: make(map[io.Closer]struct{})}
	r.mu.Lock()
	r.tokens[token] = e
	r.mu.Unlock()
	return token, func() {
		r.mu.Lock()
		delete(r.tokens, token)
		e.revoked = true
		conns := e.conns
		e.conns = nil
		r.mu.Unlock()
		for c := range conns {
			_ = c.Close()
		}
	}
}

// Lookup resolves a token to its run.
func (r *RunCredentials) Lookup(token string) (Run, bool) {
	if e := r.entry(token); e != nil {
		return e.Run, true
	}
	return Run{}, false
}

func (r *RunCredentials) entry(token string) *runEntry {
	if token == "" {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.tokens[token]
}

// track ties c to e so revoking e closes it. ok is false when e was revoked
// after the token was looked up; the caller must not proxy c then.
func (r *RunCredentials) track(e *runEntry, c io.Closer) (untrack func(), ok bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if e.revoked {
		return nil, false
	}
	e.conns[c] = struct{}{}
	return func() {
		r.mu.Lock()
		delete(e.conns, c)
		r.mu.Unlock()
	}, true
}
