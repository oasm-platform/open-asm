package grpcclient

import (
	"strings"
	"testing"
	"time"
)

// noOpLogger satisfies Logger for tests that don't care about output.
type noOpLogger struct{}

func (l *noOpLogger) Info(msg string, args ...any)    {}
func (l *noOpLogger) Success(msg string, args ...any) {}
func (l *noOpLogger) Warning(msg string, args ...any) {}
func (l *noOpLogger) Error(msg string, args ...any)   {}
func (l *noOpLogger) ErrorE(msg string, err error)    {}
func (l *noOpLogger) Verbose(msg string, args ...any) {}
func (l *noOpLogger) Debug(msg string, args ...any)   {}

func TestNewClient_Validation(t *testing.T) {
	// Given: invalid constructor inputs
	logger := &noOpLogger{}
	tests := []struct {
		name     string
		apiKey   string
		host     string
		toolPath string
		wantErr  string
	}{
		{"empty apiKey", "", "localhost:16276", "tools", "api key"},
		{"empty host", "key", "", "tools", "grpc host"},
		{"empty toolPath", "key", "localhost:16276", "", "tool path"},
		{"nil logger", "key", "localhost:16276", "tools", "logger"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// When: NewClient is called with the invalid input
			var log Logger = logger
			if tt.name == "nil logger" {
				log = nil
			}
			_, err := NewClient(tt.apiKey, tt.host, tt.toolPath, log)

			// Then: it returns an error naming the missing field
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("expected error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestNewClient_Defaults(t *testing.T) {
	// Given: valid constructor inputs (grpc.NewClient is lazy, no server needed)
	// When: NewClient succeeds
	c, err := NewClient("key", "localhost:16276", "tools", &noOpLogger{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })

	// Then: conn, stubs and auth are wired, delays have defaults
	if c.conn == nil {
		t.Error("expected conn to be set")
	}
	if c.apiKey != "key" {
		t.Errorf("expected apiKey key, got %q", c.apiKey)
	}
	if c.toolPath != "tools" {
		t.Errorf("expected toolPath tools, got %q", c.toolPath)
	}
	if c.logger == nil {
		t.Error("expected logger to be set")
	}
	if c.auth == nil {
		t.Error("expected auth to be set")
	}
	if c.workers == nil {
		t.Error("expected workers stub to be built")
	}
	if c.jobs == nil {
		t.Error("expected jobs stub to be built")
	}
	if c.connectBaseDelay != 2*time.Second {
		t.Errorf("expected connectBaseDelay 2s, got %v", c.connectBaseDelay)
	}
	if c.connectMaxDelay != 30*time.Second {
		t.Errorf("expected connectMaxDelay 30s, got %v", c.connectMaxDelay)
	}
	if c.reconnectDelay != 1*time.Second {
		t.Errorf("expected reconnectDelay 1s, got %v", c.reconnectDelay)
	}
}

func TestClient_WorkerID_InitiallyEmpty(t *testing.T) {
	// Given: a Client constructed directly (zero value)
	c := &Client{}

	// When: the worker ID is read
	// Then: it is empty
	if got := c.WorkerID(); got != "" {
		t.Errorf("expected empty worker ID, got %q", got)
	}
}

func TestClient_WorkerID_AfterSet(t *testing.T) {
	// Given: a Client with a worker ID stored (same package: direct field access)
	c := &Client{}
	c.mu.Lock()
	c.workerID = "worker-7"
	c.mu.Unlock()

	// When: the worker ID is read
	// Then: it returns the stored value
	if got := c.WorkerID(); got != "worker-7" {
		t.Errorf("expected worker-7, got %q", got)
	}
}

func TestClient_Close_NilConn(t *testing.T) {
	// Given: a Client without a connection (zero value)
	c := &Client{}

	// When: Close is called
	// Then: it succeeds without panicking
	if err := c.Close(); err != nil {
		t.Errorf("expected nil error, got %v", err)
	}
}
