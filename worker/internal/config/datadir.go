package config

import (
	"os"
	"path/filepath"
)

// dataDirName is the per-user directory holding the worker's state: the tool
// cache, agent session workspaces and the persisted join token.
const dataDirName = ".oasm"

// DataDir returns <user home>/.oasm on every OS (%USERPROFILE% on Windows,
// $HOME on Linux/macOS). Defaults must not depend on the working directory: an
// elevated PowerShell starts in C:\Windows\System32, where the worker cannot
// write. Falls back to the working directory only when no home is resolvable.
func DataDir() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return dataDirName
	}
	return filepath.Join(home, dataDirName)
}

// DataPath joins name onto DataDir.
func DataPath(name string) string {
	return filepath.Join(DataDir(), name)
}
