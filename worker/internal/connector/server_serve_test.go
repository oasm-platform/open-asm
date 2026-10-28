package connector

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
)

// Port 0 lets the OS pick a free port (several workers on one host); Port must
// report the port actually bound, never the 0 that was requested.
func TestPortReportsOSAssignedPort(t *testing.T) {
	srv, err := NewServer("127.0.0.1:0", NewProxy(), "tok")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	defer srv.lis.Close()
	if srv.Port() == 0 {
		t.Fatal("Port() = 0, want the OS-assigned port")
	}
	if want := srv.Addr().(*net.TCPAddr).Port; srv.Port() != want {
		t.Fatalf("Port() = %d, want listener port %d", srv.Port(), want)
	}
}

// Serve must surface a non-nil grpc serve error as its return value (not a
// swallowed nil) so the caller's "connector server stopped: %v" warning
// reports the real cause. grpc.Serve returns ErrServerStopped when the server
// was already stopped; Serve returns it promptly instead of waiting for ctx
// cancellation.
func TestServeReturnsServerStoppedError(t *testing.T) {
	proxy := NewProxy()
	srv, err := NewServer("127.0.0.1:0", proxy, "tok")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	// A server that already stopped makes grpc.Serve fail immediately.
	srv.grpcServer.Stop()

	err = srv.Serve(context.Background())
	if err != grpc.ErrServerStopped {
		t.Fatalf("Serve error = %v, want %v", err, grpc.ErrServerStopped)
	}
}

// The shutdown contract must stay intact: ctx cancellation triggers a graceful
// stop and Serve returns nil.
func TestServeReturnsNilOnGracefulShutdown(t *testing.T) {
	proxy := NewProxy()
	srv, err := NewServer("127.0.0.1:0", proxy, "tok")
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ctx) }()
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Serve on graceful shutdown = %v, want nil", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Serve did not return after ctx cancel")
	}
}
