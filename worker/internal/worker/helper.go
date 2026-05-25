package worker

import (
	"fmt"
	"os"
	"strings"
)

func setupCmdEnv(toolPath string) []string {
	env := make([]string, 0, len(os.Environ())+1)
	for _, e := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(e), "PATH=") {
			env = append(env, e)
		}
	}
	existingPath := os.Getenv("PATH")
	newPathEntry := fmt.Sprintf("PATH=%s", toolPath)
	if existingPath != "" {
		newPathEntry = fmt.Sprintf("PATH=%s%c%s", toolPath, os.PathListSeparator, existingPath)
	}
	env = append(env, newPathEntry)
	return env
}
