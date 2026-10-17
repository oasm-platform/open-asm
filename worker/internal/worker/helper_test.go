package worker

import (
	"os"
	"slices"
	"strings"
	"testing"
)

// Commands the worker runs on its host must never see the worker's secrets
// (API key, connector token, platform OASM_* keys), whatever their case.
func TestSetupCmdEnv_DropsSecretEnv(t *testing.T) {
	t.Setenv("WORKER_API_KEY", "platform-cloud-key")
	t.Setenv("WORKER_CONNECTOR_TOKEN", "connector-secret")
	t.Setenv("Worker_Token_File", "/app/state/.worker-token")
	t.Setenv("OASM_CLOUD_APIKEY", "cloud-key")
	t.Setenv("oasm_lower", "x")
	t.Setenv("SANDBOX_KEEP_ME", "kept")
	t.Setenv("MYWORKER_API", "kept-too") // prefix match only, not substring

	env := setupCmdEnv("/opt/tools")

	for _, e := range env {
		u := strings.ToUpper(e)
		if strings.HasPrefix(u, "WORKER_") || strings.HasPrefix(u, "OASM_") {
			t.Errorf("secret env leaked to command: %q", e)
		}
	}
	if !slices.Contains(env, "SANDBOX_KEEP_ME=kept") || !slices.Contains(env, "MYWORKER_API=kept-too") {
		t.Errorf("non-secret env must be kept, got %v", env)
	}
}

// PATH handling is unchanged: one PATH entry, tool dir first.
func TestSetupCmdEnv_ToolPathFirstOnPath(t *testing.T) {
	t.Setenv("PATH", "/usr/bin")
	env := setupCmdEnv("/opt/tools")

	var paths []string
	for _, e := range env {
		if len(e) >= 5 && strings.EqualFold(e[:5], "PATH=") {
			paths = append(paths, e)
		}
	}
	want := "PATH=/opt/tools" + string(os.PathListSeparator) + "/usr/bin"
	if len(paths) != 1 || paths[0] != want {
		t.Fatalf("PATH entries = %v, want [%s]", paths, want)
	}
}

func TestIsSecretEnv(t *testing.T) {
	cases := map[string]bool{
		"WORKER_API_KEY=x": true,
		"worker_x=y":       true,
		"OASM_CONFIG={}":   true,
		"Oasm_A=b":         true,
		"WORKER=x":         false,
		"OASM=x":           false,
		"HOME=/root":       false,
		"PATH=/bin":        false,
	}
	for in, want := range cases {
		if got := isSecretEnv(in); got != want {
			t.Errorf("isSecretEnv(%q) = %v, want %v", in, got, want)
		}
	}
}
