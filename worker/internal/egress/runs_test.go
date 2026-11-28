package egress

import "testing"

func TestRunCredentialsIssueLookupRevoke(t *testing.T) {
	r := NewRunCredentials()
	tok, revoke := r.Issue("sess-1")
	if len(tok) != 64 {
		t.Fatalf("token must be 32 random bytes hex, got len %d", len(tok))
	}
	if got, ok := r.Lookup(tok); !ok || got.SessionID != "sess-1" {
		t.Fatalf("Lookup(issued) = %+v, %v; want sess-1, true", got, ok)
	}

	tok2, revoke2 := r.Issue("sess-1")
	defer revoke2()
	if tok2 == tok {
		t.Fatal("two issues for the same session must give different tokens")
	}

	revoke()
	if _, ok := r.Lookup(tok); ok {
		t.Fatal("revoked token must not resolve")
	}
	revoke() // idempotent
	if got, ok := r.Lookup(tok2); !ok || got.SessionID != "sess-1" {
		t.Fatal("revoking one token must not revoke another of the same session")
	}
	if _, ok := r.Lookup(""); ok {
		t.Fatal("empty token must never resolve")
	}
}
