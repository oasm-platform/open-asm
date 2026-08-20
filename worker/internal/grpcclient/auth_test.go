package grpcclient

import (
	"context"
	"testing"
)

func TestTokenAuth_GetRequestMetadata(t *testing.T) {
	// Given: a tokenAuth without any token set
	a := &tokenAuth{}

	// When: metadata is requested before a token is set
	md, err := a.GetRequestMetadata(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Then: the worker-token entry is present but empty
	if v := md[workerTokenHeader]; v != "" {
		t.Errorf("expected empty token before setToken, got %q", v)
	}

	// When: a token is set
	a.setToken("abc123")

	// Then: metadata carries it under the worker-token header
	md, err = a.GetRequestMetadata(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if md[workerTokenHeader] != "abc123" {
		t.Errorf("expected abc123, got %q", md[workerTokenHeader])
	}
}

func TestTokenAuth_RequireTransportSecurity(t *testing.T) {
	// Given: a fresh tokenAuth
	a := &tokenAuth{}

	// When: transport security requirement is queried
	// Then: it must be false (server runs plaintext gRPC)
	if a.RequireTransportSecurity() != false {
		t.Error("expected RequireTransportSecurity to return false")
	}
}

func TestTokenAuth_CurrentToken(t *testing.T) {
	// Given: a tokenAuth with a token set
	a := &tokenAuth{}
	a.setToken("tok-42")

	// When: the current token is read back
	// Then: it matches what was set
	if got := a.currentToken(); got != "tok-42" {
		t.Errorf("expected tok-42, got %q", got)
	}
}
