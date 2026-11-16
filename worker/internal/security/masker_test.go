package security

import "testing"

func TestSecretMaskerHidesTheJobSecrets(t *testing.T) {
	m := NewSecretMasker(
		map[string]any{"apiKey": "nessus-key-123", "accessKey": "AKIA0000", "rateLimit": "50", "url": "https://scan.example"},
		map[string]any{"token": "glpat-abcdef", "target": "example.com"},
	)

	got := m.Mask("using nessus-key-123 and AKIA0000 to clone with glpat-abcdef against example.com at rate 50 on https://scan.example")

	want := "using *** and *** to clone with *** against example.com at rate 50 on https://scan.example"
	if got != want {
		t.Fatalf("Mask() = %q\nwant      %q", got, want)
	}
}

func TestSecretMaskerHidesTheLongerSecretFirst(t *testing.T) {
	m := NewSecretMasker(map[string]any{"password": "hunter2", "token": "hunter2-extended"}, nil)

	if got := m.Mask("hunter2-extended"); got != "***" {
		t.Fatalf("Mask() = %q, want the whole longer secret hidden", got)
	}
}

func TestSecretMaskerIgnoresTooShortValues(t *testing.T) {
	// Masking "ab" would shred ordinary output.
	m := NewSecretMasker(map[string]any{"token": "ab"}, nil)

	if got := m.Mask("tab table"); got != "tab table" {
		t.Fatalf("Mask() = %q", got)
	}
}

func TestNilSecretMaskerPassesThrough(t *testing.T) {
	var m *SecretMasker

	if got := m.Mask("plain"); got != "plain" {
		t.Fatalf("Mask() = %q", got)
	}
}
