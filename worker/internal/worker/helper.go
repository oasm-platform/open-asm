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
	env = append(env, fmt.Sprintf("PATH=%s%c%s", toolPath, os.PathListSeparator, os.Getenv("PATH")))
	return env
}
