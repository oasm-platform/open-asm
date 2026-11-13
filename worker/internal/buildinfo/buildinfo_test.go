package buildinfo

import "testing"

func TestCurrentReturnsStampedVersion(t *testing.T) {
	original := Version
	t.Cleanup(func() { Version = original })

	Version = "v0.13.0"

	if got := Current(); got != "v0.13.0" {
		t.Fatalf("Current() = %q, want %q", got, "v0.13.0")
	}
}

func TestCurrentFallsBackToDevWhenUnstamped(t *testing.T) {
	original := Version
	t.Cleanup(func() { Version = original })

	// An image built without --build-arg APP_VERSION stamps an empty string.
	for _, unstamped := range []string{"", "   "} {
		Version = unstamped
		if got := Current(); got != DevVersion {
			t.Fatalf("Current() with Version=%q = %q, want %q", unstamped, got, DevVersion)
		}
	}
}
