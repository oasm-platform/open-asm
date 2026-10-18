package worker

import (
	"sync"
	"time"
)

const (
	// sandboxIdleTTL is how long a session's sandbox container outlives its
	// last command. Core opens a new session for every agent command and
	// never closes it, so without this each command would leave a running
	// container behind until the worker restarts.
	sandboxIdleTTL = 30 * time.Second
	// maxLiveSandboxes caps session containers alive at once (running plus
	// idle) on a worker shared by many workspaces; over it a command fails
	// instead of exhausting the host.
	maxLiveSandboxes = 32
	// sandboxCommandTimeout bounds one sandboxed command. Core stops waiting
	// for a command after 60s, so a longer run only burns a shared host.
	sandboxCommandTimeout = 90 * time.Second
)

// sandboxSessions tracks the sandbox containers of agent sessions across
// remote execute stream reconnects (a reconnect must not kill a running
// command) and removes each one once it has been idle for idleTTL.
type sandboxSessions struct {
	idleTTL time.Duration
	max     int
	// release removes a session's container; called outside mu.
	release func(sessionID string)

	mu   sync.Mutex
	live map[string]*sandboxSessionState
}

type sandboxSessionState struct {
	inFlight int
	timer    *time.Timer
}

func newSandboxSessions(idleTTL time.Duration, max int, release func(sessionID string)) *sandboxSessions {
	return &sandboxSessions{
		idleTTL: idleTTL,
		max:     max,
		release: release,
		live:    make(map[string]*sandboxSessionState),
	}
}

// begin marks a command of the session as running. It returns false when a
// new session would exceed the cap; isNew is true for a session's first
// command.
func (s *sandboxSessions) begin(sessionID string) (ok, isNew bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if st, found := s.live[sessionID]; found {
		st.inFlight++
		if st.timer != nil {
			st.timer.Stop()
			st.timer = nil
		}
		return true, false
	}
	if len(s.live) >= s.max {
		return false, false
	}
	s.live[sessionID] = &sandboxSessionState{inFlight: 1}
	return true, true
}

// end marks a command of the session as finished; the session's container
// is released once no command has run in it for idleTTL.
func (s *sandboxSessions) end(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, found := s.live[sessionID]
	if !found {
		return
	}
	if st.inFlight > 0 {
		st.inFlight--
	}
	if st.inFlight > 0 {
		return
	}
	st.timer = time.AfterFunc(s.idleTTL, func() { s.expire(sessionID, st) })
}

func (s *sandboxSessions) expire(sessionID string, st *sandboxSessionState) {
	s.mu.Lock()
	// A command that began after the timer fired owns the session again
	if s.live[sessionID] != st || st.inFlight > 0 {
		s.mu.Unlock()
		return
	}
	delete(s.live, sessionID)
	s.mu.Unlock()
	s.release(sessionID)
}

// closeAll releases every session (handler shutdown).
func (s *sandboxSessions) closeAll() {
	s.mu.Lock()
	ids := make([]string, 0, len(s.live))
	for id, st := range s.live {
		if st.timer != nil {
			st.timer.Stop()
		}
		ids = append(ids, id)
	}
	s.live = make(map[string]*sandboxSessionState)
	s.mu.Unlock()
	for _, id := range ids {
		s.release(id)
	}
}
