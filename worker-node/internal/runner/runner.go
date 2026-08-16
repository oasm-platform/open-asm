// Package runner executes worker-node jobs.
//
// This is a temporary shim that runs job commands via the local shell. It is
// intended to be replaced by a Docker-based runner in a follow-up.
package runner

import (
	"context"
	"errors"
	"os/exec"

	"github.com/oasm-platform/open-asm/grpc-client/go/jobs_registry"
)

// Runner executes a job and returns the raw output produced by it.
type Runner interface {
	Run(ctx context.Context, job *jobs_registry.Job) (raw string, err error)
}

// ShellRunner executes job commands via `sh -c` on the local machine.
type ShellRunner struct{}

// Run executes the job's command with the local shell and returns its
// combined output. A non-nil error means the command failed and the job
// submission should be marked as an error downstream.
func (ShellRunner) Run(ctx context.Context, job *jobs_registry.Job) (string, error) {
	if job.GetCommand() == "" {
		return "", errors.New("job has no command")
	}

	cmd := exec.CommandContext(ctx, "sh", "-c", job.GetCommand())
	out, err := cmd.CombinedOutput()
	return string(out), err
}
