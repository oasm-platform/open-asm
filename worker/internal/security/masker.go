package security

import (
	"regexp"
	"sort"
	"strings"
)

// sensitiveName matches the config keys core-api encrypts and masks as
// secrets (SENSITIVE_NAME_RE in tool-config-profiles.crypto.ts).
var sensitiveName = regexp.MustCompile(`(?i)(password|passwd|secret|token|api_?key|access_?key)`)

// minSecretLength keeps very short values from shredding ordinary output.
const minSecretLength = 4

const secretMask = "***"

// SecretMasker hides a job's credentials in text the worker logs or sends
// back to core-api (container logs, raw results, error messages): a tool
// that echoes its command line or config must not leak them further.
type SecretMasker struct {
	replacer *strings.Replacer
}

// NewSecretMasker collects the secrets of one job: the string config values
// under a secret-looking key, and the repository token input.
func NewSecretMasker(config, inputs map[string]any) *SecretMasker {
	var secrets []string
	for key, value := range config {
		if s, ok := value.(string); ok && sensitiveName.MatchString(key) {
			secrets = append(secrets, s)
		}
	}
	if s, ok := inputs["token"].(string); ok {
		secrets = append(secrets, s)
	}

	// Longest first, so a secret that contains another is hidden whole.
	sort.Slice(secrets, func(i, j int) bool { return len(secrets[i]) > len(secrets[j]) })
	var pairs []string
	for _, s := range secrets {
		if len(s) >= minSecretLength {
			pairs = append(pairs, s, secretMask)
		}
	}
	if len(pairs) == 0 {
		return nil
	}
	return &SecretMasker{replacer: strings.NewReplacer(pairs...)}
}

// Mask returns text with every secret replaced. A nil masker (a job without
// secrets) returns text unchanged.
func (m *SecretMasker) Mask(text string) string {
	if m == nil {
		return text
	}
	return m.replacer.Replace(text)
}
