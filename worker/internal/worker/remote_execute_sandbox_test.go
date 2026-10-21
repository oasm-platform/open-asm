package worker

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// recordingSender captures the results a command reports.
type recordingSender struct {
	mu     sync.Mutex
	stdout []string
	exits  []int32
	errs   []string
}

func (r *recordingSender) SendStdout(_ context.Context, b []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stdout = append(r.stdout, string(b))
	return nil
}

func (r *recordingSender) SendExit(_ context.Context, c int32) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.exits = append(r.exits, c)
	return nil
}

func (r *recordingSender) SendError(_ context.Context, m string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.errs = append(r.errs, m)
	return nil
}

// fakeSandbox replays fixed output and exit code.
type fakeSandbox struct {
	out    []string
	code   int
	err    error
	closed []string
}

func (f *fakeSandbox) Exec(_ context.Context, _, _ string, out func([]byte) error) (int, error) {
	for _, o := range f.out {
		if err := out([]byte(o)); err != nil {
			return -1, err
		}
	}
	return f.code, f.err
}

func (f *fakeSandbox) Close(_ context.Context, sessionID string) error {
	f.closed = append(f.closed, sessionID)
	return nil
}

func TestSelectCommandSandbox(t *testing.T) {
	if sb := selectCommandSandbox(false, nil, errors.New("x")); sb != nil {
		t.Fatalf("disabled sandbox must select the host path (nil), got %T", sb)
	}
	sb := selectCommandSandbox(true, nil, nil)
	if _, ok := sb.(unavailableSandbox); !ok {
		t.Fatalf("enabled sandbox without a runtime must fail closed, got %T", sb)
	}
}

// Fail closed: sandbox requested but unavailable -> the command errors and
// is never run on the host.
func TestExecuteRemoteCommand_SandboxUnavailableFailsClosed(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "ran-on-host")
	cmdSandbox := selectCommandSandbox(true, nil, errors.New("docker engine unreachable"))

	sb, err := newSessionSandbox(dir, "sess-1", cmdSandbox)
	if err != nil {
		t.Fatalf("newSessionSandbox: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "sess-1")); !os.IsNotExist(err) {
		t.Fatalf("sandboxed session must not create a host session dir (stat err=%v)", err)
	}

	rec := &recordingSender{}
	executeRemoteCommand(context.Background(), rec, "sess-1", "echo hi > "+filepath.ToSlash(marker), sb, nil, dir)

	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("command ran on the host despite the sandbox being required")
	}
	if len(rec.errs) != 1 || !strings.Contains(rec.errs[0], "agent sandbox unavailable") {
		t.Fatalf("want one ERROR result naming the sandbox, got %v", rec.errs)
	}
	if len(rec.stdout) != 0 || len(rec.exits) != 0 {
		t.Fatalf("no stdout/EXIT may follow a fail-closed ERROR: stdout=%v exits=%v", rec.stdout, rec.exits)
	}
}

func TestExecuteRemoteCommand_SandboxStreamsOutputAndExitCode(t *testing.T) {
	fake := &fakeSandbox{out: []string{"a\n", "b\n"}, code: 3}
	sb, _ := newSessionSandbox(t.TempDir(), "sess-2", fake)
	rec := &recordingSender{}

	executeRemoteCommand(context.Background(), rec, "sess-2", "false", sb, nil, "/tools")

	if strings.Join(rec.stdout, "") != "a\nb\n" {
		t.Errorf("stdout = %q", rec.stdout)
	}
	if len(rec.exits) != 1 || rec.exits[0] != 3 || len(rec.errs) != 0 {
		t.Errorf("want EXIT 3 and no error, got exits=%v errs=%v", rec.exits, rec.errs)
	}

	if err := sb.close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if len(fake.closed) != 1 || fake.closed[0] != "sess-2" {
		t.Errorf("session close must remove the sandbox container, got %v", fake.closed)
	}
}

func TestExecuteRemoteCommand_SandboxExecErrorIsErrorResult(t *testing.T) {
	sb, _ := newSessionSandbox(t.TempDir(), "sess-3", &fakeSandbox{err: errors.New("sandbox create: boom")})
	rec := &recordingSender{}

	executeRemoteCommand(context.Background(), rec, "sess-3", "id", sb, nil, "/tools")

	if len(rec.errs) != 1 || !strings.Contains(rec.errs[0], "boom") || len(rec.exits) != 0 {
		t.Fatalf("want a single ERROR result, got errs=%v exits=%v", rec.errs, rec.exits)
	}
}
