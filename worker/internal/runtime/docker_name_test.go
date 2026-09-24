package runtime

import (
	"regexp"
	"strings"
	"testing"
)

// containerNameRe is the shipped name shape: oasm-<tool-slug>-<registry-slug>-<rand4>.
// Slugs may themselves contain dashes, so the shape is checked structurally.
var containerNameRe = regexp.MustCompile(`^oasm-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{4}$`)

// Container naming contract: oasm-<tool-slug>-<registry-slug>-<rand4>.
// Keep it short enough to read in a container listing and free of the doubled
// separators the old 8-char image truncation produced
// ("ghcr-io-" + "-" → "oasm-nuclei-ghcr-io--a3f1").
func TestBuildContainerNameFormat(t *testing.T) {
	tests := []struct {
		name      string
		tool      string
		image     string
		wantParts []string // substrings that must appear, in order
	}{
		{
			name:      "ghcr registry",
			tool:      "Nuclei Scanner",
			image:     "ghcr.io/open-asm/nuclei:1.0",
			wantParts: []string{"oasm-", "nuclei-scanner", "ghcr-io"},
		},
		{
			name:      "docker hub short form",
			tool:      "nikto",
			image:     "nikto:latest",
			wantParts: []string{"oasm-", "nikto", "docker-io"},
		},
		{
			name:      "docker hub explicit library",
			tool:      "nuclei",
			image:     "library/nuclei",
			wantParts: []string{"oasm-", "nuclei", "docker-io"},
		},
		{
			name:      "registry with port",
			tool:      "nmap",
			image:     "registry.local:5000/oasm/nmap:7.97",
			wantParts: []string{"oasm-", "nmap", "registry-local-5000"},
		},
		{
			name:      "localhost registry",
			tool:      "ffuf",
			image:     "localhost/ffuf:latest",
			wantParts: []string{"oasm-", "ffuf", "localhost"},
		},
		{
			name:      "digest reference",
			tool:      "httpx",
			image:     "ghcr.io/open-asm/httpx@sha256:abc123",
			wantParts: []string{"oasm-", "httpx", "ghcr-io"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := buildContainerName(tc.tool, tc.image)

			if !dockerNameRe.MatchString(got) {
				t.Fatalf("name %q violates Docker name charset %s", got, dockerNameRe)
			}
			if !strings.HasPrefix(got, "oasm-") {
				t.Fatalf("name %q must start with oasm-", got)
			}
			if strings.Contains(got, "--") {
				t.Fatalf("name %q must not contain a doubled separator", got)
			}
			// The full image/pool key must never be embedded: it is what made
			// the old names long ("ghcr-io-open-asm-nuclei-1-0").
			if strings.Contains(got, "open-asm") {
				t.Fatalf("name %q must not embed the image repository path", got)
			}
			if !containerNameRe.MatchString(got) {
				t.Fatalf("name %q does not match oasm-<tool>-<registry>-<rand4> (%s)", got, containerNameRe)
			}
			prev := 0
			for _, part := range tc.wantParts {
				idx := strings.Index(got, part)
				if idx < 0 {
					t.Fatalf("name %q must contain %q", got, part)
				}
				if idx < prev {
					t.Fatalf("name %q has %q out of order", got, part)
				}
				prev = idx
			}
		})
	}
}

// Repeated separators in the source must collapse to one. A display name such
// as "Nikto - Web Server Scanner" sanitizes to "nikto---web-server-scanner"
// (space → '-', literal '-', space → '-') because the literal dash is a valid
// character and resets the collapse state. Manifest slugs are the primary
// input, but the worker must stay well-formed if a display name ever leaks
// through an older core or a hand-edited manifest.
func TestSanitizeToolNameCollapsesRepeatedSeparators(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{in: "Nikto - Web Server Scanner", want: "nikto-web-server-scanner"},
		{in: "nikto---web", want: "nikto-web"},
		{in: "a - - b", want: "a-b"},
		{in: "Nuclei Scanner", want: "nuclei-scanner"},
		{in: "trailing---", want: "trailing"},
		{in: "---leading", want: "leading"},
		{in: "", want: "tool"},
	}

	for _, tc := range tests {
		t.Run(tc.in, func(t *testing.T) {
			got := sanitizeToolName(tc.in)
			if got != tc.want {
				t.Fatalf("sanitizeToolName(%q) = %q, want %q", tc.in, got, tc.want)
			}
			if strings.Contains(got, "--") {
				t.Fatalf("sanitizeToolName(%q) = %q, must not contain a doubled separator", tc.in, got)
			}
		})
	}
}

// The random suffix must actually vary so concurrent creates never collide and
// a 409 Conflict retry lands on a fresh name.
func TestBuildContainerNameRandomSuffixVaries(t *testing.T) {
	seen := make(map[string]struct{}, 50)
	for i := 0; i < 50; i++ {
		name := buildContainerName("nuclei", "ghcr.io/open-asm/nuclei:1.0")
		if _, dup := seen[name]; dup {
			t.Fatalf("buildContainerName returned duplicate %q within 50 calls", name)
		}
		seen[name] = struct{}{}
	}
}

// The tool slug may be empty/garbage — the name must stay valid and keep the
// oasm- prefix rather than collapsing to a bare "oasm--..." string.
func TestBuildContainerNameHandlesEmptyTool(t *testing.T) {
	got := buildContainerName("", "ghcr.io/open-asm/nuclei:1.0")
	if !strings.HasPrefix(got, "oasm-") {
		t.Fatalf("name %q must start with oasm-", got)
	}
	if !dockerNameRe.MatchString(got) {
		t.Fatalf("name %q violates Docker name charset %s", got, dockerNameRe)
	}
	if strings.Contains(got, "--") {
		t.Fatalf("name %q must not contain a doubled separator", got)
	}
	if !containerNameRe.MatchString(got) {
		t.Fatalf("name %q does not match oasm-<tool>-<registry>-<rand4> (%s)", got, containerNameRe)
	}
}
