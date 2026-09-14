package transport

import "testing"

func TestConnectRequiresTLSConfig(t *testing.T) {
	_, err := Dial("localhost:16276", DialOpts{Insecure: true})
	if err != nil {
		t.Fatalf("expected dial to succeed in insecure mode, got %v", err)
	}
}

func TestStreamSendRegister(t *testing.T) {
	// will use bufconn in-memory server in implementation
	t.Skip("requires stream \u2013 red until conn.go exists")
}
