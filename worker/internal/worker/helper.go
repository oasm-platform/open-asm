package worker

import (
	"fmt"
	"os"
	"strings"
)

func setupCmdEnv(toolPath string) []string {
	// ponytail: single-pass filter; cached PATH; case-insensitive via EqualFold on prefix only.
	existingPath := os.Getenv("PATH")
	environ := os.Environ()
	env := make([]string, 0, len(environ)+1)
	for _, e := range environ {
		if len(e) >= 5 && strings.EqualFold(e[:5], "PATH=") {
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
