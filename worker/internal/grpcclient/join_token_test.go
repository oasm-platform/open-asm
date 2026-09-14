package grpcclient

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	workers "oasm-worker/internal/gen/workers"
)

// recordingLogger captures log calls so tests can assert on warn messages.
type recordingLogger struct {
	mu   sync.Mutex
	warn []string
}

func (l *recordingLogger) Info(msg string, args ...any)    {}
func (l *recordingLogger) Success(msg string, args ...any) {}
func (l *recordingLogger) Warning(msg string, args ...any) {
	l.mu.Lock()
	l.warn = append(l.warn, msg)
	l.mu.Unlock()
}
func (l *recordingLogger) Error(msg string, args ...any)   {}
func (l *recordingLogger) ErrorE(msg string, err error)    {}
func (l *recordingLogger) Verbose(msg string, args ...any) {}
func (l *recordingLogger) Debug(msg string, args ...any)   {}

func (l *recordingLogger) warnings() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string(nil), l.warn...)
}

func (l *recordingLogger) hasWarning(substr string) bool {
	for _, w := range l.warnings() {
		if strings.Contains(w, substr) {
			return true
		}
	}
	return false
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	return strings.TrimSpace(string(b))
}

func TestJoin_MissingTokenFile_WarnsAndRegistersNewWorker(t *testing.T) {
	// Given: a fresh client with no persisted token file, and a server that
	// assigns a brand-new worker identity on a tokenless join.
	log := &recordingLogger{}
	srv := newTestServerWithLogger(t, log)
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		if req.Token != nil {
			t.Errorf("expected no token on fresh join, got %q", *req.Token)
		}
		return &workers.JoinResponse{WorkerId: "w-9", WorkerToken: "tok-9"}, nil
	}

	// When: Join runs without any persisted token
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: a new worker id is assigned, a clear warning is logged, and the
	// returned token is persisted so a later restart can rejoin.
	if got := srv.client.WorkerID(); got != "w-9" {
		t.Errorf("expected new worker id w-9, got %q", got)
	}
	// newTestServer routes the token file into a temp dir; it must now exist.
	if got := readFile(t, srv.client.tokenFile); got != "tok-9" {
		t.Errorf("expected token file to contain tok-9, got %q", got)
	}
	if !log.hasWarning("no worker token") {
		t.Errorf("expected a warning about the missing token file, got %v", log.warnings())
	}
}

func TestJoin_PersistedToken_SentOnSecondJoin_ReusesWorkerID(t *testing.T) {
	// Given: a token file already exists (as if persisted by a previous run),
	// and the server only reuses the worker identity when the token matches.
	dir := t.TempDir()
	tokenFile := filepath.Join(dir, ".worker-token")
	if err := os.WriteFile(tokenFile, []byte("tok-persisted\n"), 0o600); err != nil {
		t.Fatalf("failed to seed token file: %v", err)
	}
	t.Setenv("WORKER_TOKEN_FILE", tokenFile)

	srv := newTestServer(t)
	seenToken := ""
	srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		if req.Token != nil {
			seenToken = *req.Token
		}
		// Mirror core-api workers.service.ts: token match -> same worker id,
		// otherwise a brand-new identity.
		if req.Token != nil && *req.Token == "tok-persisted" {
			return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
		}
		return &workers.JoinResponse{WorkerId: "w-2", WorkerToken: "tok-2"}, nil
	}

	// When: Join runs with the persisted token loaded at startup
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: the token was carried in the Join request and the server re-used
	// the original worker id instead of minting a new one.
	if seenToken != "tok-persisted" {
		t.Errorf("expected join request to carry tok-persisted, got %q", seenToken)
	}
	if got := srv.client.WorkerID(); got != "w-1" {
		t.Errorf("expected rejoin to reuse worker id w-1, got %q", got)
	}
	if got := readFile(t, srv.client.tokenFile); got != "tok-1" {
		t.Errorf("expected token file rotated to tok-1, got %q", got)
	}
}

func TestJoin_Restart_LoadsPersistedToken_ReusesWorkerID(t *testing.T) {
	// Given: a full worker lifecycle across a restart — run A joins fresh and
	// persists its token; run B (new process) must load it and rejoin with the
	// same identity.
	dir := t.TempDir()
	tokenFile := filepath.Join(dir, ".worker-token")
	t.Setenv("WORKER_TOKEN_FILE", tokenFile)

	// Run A: first registration, no token yet.
	srvA := newTestServer(t)
	srvA.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		if req.Token != nil {
			t.Errorf("run A: expected no token, got %q", *req.Token)
		}
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}
	if err := srvA.client.Join(context.Background()); err != nil {
		t.Fatalf("run A join failed: %v", err)
	}
	if got := readFile(t, tokenFile); got != "tok-1" {
		t.Fatalf("expected token file to contain tok-1 after run A, got %q", got)
	}

	// Run B: a brand-new Client in the same process, simulating a restart.
	srvB := newTestServer(t)
	srvB.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		if req.Token == nil || *req.Token != "tok-1" {
			return &workers.JoinResponse{WorkerId: "w-2", WorkerToken: "tok-2"}, nil
		}
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}
	if err := srvB.client.Join(context.Background()); err != nil {
		t.Fatalf("run B join failed: %v", err)
	}

	// Then: run B re-joined with the persisted token and got run A's identity.
	srvB.workersSrv.mu.Lock()
	defer srvB.workersSrv.mu.Unlock()
	if len(srvB.workersSrv.joinCalls) != 1 {
		t.Fatalf("expected 1 join call in run B, got %d", len(srvB.workersSrv.joinCalls))
	}
	if tok := srvB.workersSrv.joinCalls[0].token; tok != "tok-1" {
		t.Errorf("run B: expected join request token tok-1, got %q", tok)
	}
	if got := srvB.client.WorkerID(); got != "w-1" {
		t.Errorf("run B: expected worker id w-1 (reused), got %q", got)
	}
}

func TestJoin_SignatureFromEnv(t *testing.T) {
	t.Run("sent when WORKER_SIGNATURE is set", func(t *testing.T) {
		// Given: a worker configured with a join signature
		t.Setenv("WORKER_SIGNATURE", "sig-abc")
		srv := newTestServer(t)
		srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
			return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
		}

		// When: Join runs
		if err := srv.client.Join(context.Background()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Then: the signature is carried in the request
		srv.workersSrv.mu.Lock()
		defer srv.workersSrv.mu.Unlock()
		if got := srv.workersSrv.joinCalls[0].signature; got != "sig-abc" {
			t.Errorf("expected signature sig-abc, got %q", got)
		}
	})

	t.Run("empty when env is not set", func(t *testing.T) {
		// Given: no WORKER_SIGNATURE in the environment
		t.Setenv("WORKER_SIGNATURE", "")
		srv := newTestServer(t)
		srv.workersSrv.joinFn = func(ctx context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
			return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
		}

		// When: Join runs
		if err := srv.client.Join(context.Background()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Then: no signature is sent
		srv.workersSrv.mu.Lock()
		defer srv.workersSrv.mu.Unlock()
		if got := srv.workersSrv.joinCalls[0].signature; got != "" {
			t.Errorf("expected empty signature, got %q", got)
		}
	})
}
