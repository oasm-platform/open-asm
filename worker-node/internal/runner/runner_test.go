package runner

import (
	"context"
	"strings"
	"testing"

	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

func TestShellRunner(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		command := "echo hello"
		job := &jobs_registry.Job{Command: &command}

		raw, err := (ShellRunner{}).Run(context.Background(), job)
		if err != nil {
			t.Fatalf("Run() error = %v, want nil", err)
		}
		if !strings.Contains(raw, "hello") {
			t.Fatalf("Run() raw = %q, want it to contain %q", raw, "hello")
		}
	})

	t.Run("failure", func(t *testing.T) {
		command := "exit 3"
		job := &jobs_registry.Job{Command: &command}

		_, err := (ShellRunner{}).Run(context.Background(), job)
		if err == nil {
			t.Fatal("Run() error = nil, want non-nil")
		}
	})

	t.Run("nil command", func(t *testing.T) {
		job := &jobs_registry.Job{}

		_, err := (ShellRunner{}).Run(context.Background(), job)
		if err == nil {
			t.Fatal("Run() error = nil, want non-nil")
		}
		if !strings.Contains(err.Error(), "no command") {
			t.Fatalf("Run() error = %q, want it to mention %q", err.Error(), "no command")
		}
	})
}
