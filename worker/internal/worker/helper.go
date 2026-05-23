package worker

import (
	"fmt"
	"os"
	"strings"
)

func setupCmdEnv(toolPath string) []string {
	env := os.Environ()
	pathKey := "PATH"
	existingPath := ""

	for i, e := range env {
		pair := strings.SplitN(e, "=", 2)
		if len(pair) == 2 && strings.ToUpper(pair[0]) == "PATH" {
			pathKey = pair[0]
			existingPath = pair[1]

			env = append(env[:i], env[i+1:]...)
			break
		}
	}

	if existingPath == "" {
		existingPath = os.Getenv(pathKey)
	}

	newPathEntry := fmt.Sprintf("%s=%s%c%s", pathKey, toolPath, os.PathListSeparator, existingPath)
	return append(env, newPathEntry)
}
