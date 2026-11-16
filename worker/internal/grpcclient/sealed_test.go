package grpcclient

import (
	"bytes"
	"context"
	"os"
	"testing"

	workers "oasm-worker/internal/gen/workers"
)

// The worker sends the public half of a key it keeps next to its token, so
// core-api can seal job secrets to it; a restart sends the same key.
func TestJoinSendsThePersistedEncryptionPublicKey(t *testing.T) {
	srv := newTestServerWithLogger(t, &recordingLogger{})
	var sent []byte
	srv.workersSrv.joinFn = func(_ context.Context, req *workers.JoinRequest) (*workers.JoinResponse, error) {
		sent = req.GetEncryptionPublicKey()
		return &workers.JoinResponse{WorkerId: "w-1", WorkerToken: "tok-1"}, nil
	}

	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatalf("Join: %v", err)
	}

	if len(sent) != 65 {
		t.Fatalf("expected a 65-byte P-256 public key on Join, got %d bytes", len(sent))
	}
	if !bytes.Equal(sent, srv.client.encKey.PublicKey()) {
		t.Fatal("Join sent a key the client does not hold")
	}
	if info, err := os.Stat(srv.client.tokenFile + ".key"); err != nil {
		t.Fatalf("encryption key not stored next to the token: %v", err)
	} else if info.Size() == 0 {
		t.Fatal("encryption key file is empty")
	}
}
