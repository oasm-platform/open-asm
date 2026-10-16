package worker

import (
	"fmt"
	"os"
	"strings"
)

// secretEnvPrefixes are env-var prefixes never handed to commands the worker
// runs on its host: WORKER_* carries the API key (on a cloud worker the
// platform-wide key) and connector token, OASM_* the platform secrets. A
// command that can read them can impersonate the worker.
var secretEnvPrefixes = []string{"WORKER_", "OASM_"}

func isSecretEnv(entry string) bool {
	for _, p := range secretEnvPrefixes {
		if len(entry) >= len(p) && strings.EqualFold(entry[:len(p)], p) {
			return true
		}
	}
	return false
}

func setupCmdEnv(toolPath string) []string {
	// ponytail: single-pass filter; cached PATH; case-insensitive via EqualFold on prefix only.
	existingPath := os.Getenv("PATH")
	environ := os.Environ()
	env := make([]string, 0, len(environ)+1)
	for _, e := range environ {
		if len(e) >= 5 && strings.EqualFold(e[:5], "PATH=") {
			continue
		}
		if isSecretEnv(e) {
			continue
		}
		env = append(env, e)
	}
	newPathEntry := fmt.Sprintf("PATH=%s", toolPath)
	if existingPath != "" {
		newPathEntry = fmt.Sprintf("PATH=%s%c%s", toolPath, os.PathListSeparator, existingPath)
	}
	env = append(env, newPathEntry)
	return env
}
