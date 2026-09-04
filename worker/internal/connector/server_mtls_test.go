package connector

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"

	pb "oasm-worker/internal/gen/connector"
)

// testPKI holds self-signed CA + server + client certificates (stdlib only,
// no external deps): the CA signs both the server cert (SANs localhost +
// 127.0.0.1) and the client cert (clientAuth EKU).
type testPKI struct {
	caCertPEM                   []byte
	serverCertPEM, serverKeyPEM []byte
	clientCertPEM, clientKeyPEM []byte
}

func newTestPKI(t *testing.T) *testPKI {
	t.Helper()

	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate CA key: %v", err)
	}
	caTmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "oasm-test-ca"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
	}
	caDER, err := x509.CreateCertificate(rand.Reader, caTmpl, caTmpl, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create CA cert: %v", err)
	}
	caCert, err := x509.ParseCertificate(caDER)
	if err != nil {
		t.Fatalf("parse CA cert: %v", err)
	}

	serverKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate server key: %v", err)
	}
	serverTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: "localhost"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	serverDER, err := x509.CreateCertificate(rand.Reader, serverTmpl, caCert, &serverKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create server cert: %v", err)
	}

	clientKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate client key: %v", err)
	}
	clientTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject:      pkix.Name{CommonName: "oasm-test-connector"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	clientDER, err := x509.CreateCertificate(rand.Reader, clientTmpl, caCert, &clientKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create client cert: %v", err)
	}

	pemEncode := func(der []byte) []byte {
		return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	}
	keyPEM := func(k *ecdsa.PrivateKey) []byte {
		der, err := x509.MarshalECPrivateKey(k)
		if err != nil {
			t.Fatalf("marshal private key: %v", err)
		}
		return pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})
	}
	return &testPKI{
		caCertPEM:     pemEncode(caDER),
		serverCertPEM: pemEncode(serverDER),
		serverKeyPEM:  keyPEM(serverKey),
		clientCertPEM: pemEncode(clientDER),
		clientKeyPEM:  keyPEM(clientKey),
	}
}

// setTLSEnv writes the PKI material to temp files and sets the three
// WORKER_CONNECTOR_TLS_* env vars (restored at test end via t.Setenv).
func setTLSEnv(t *testing.T, pki *testPKI) {
	t.Helper()
	dir := t.TempDir()
	caFile := filepath.Join(dir, "ca.pem")
	certFile := filepath.Join(dir, "server.pem")
	keyFile := filepath.Join(dir, "server-key.pem")
	if err := os.WriteFile(caFile, pki.caCertPEM, 0o600); err != nil {
		t.Fatalf("write ca: %v", err)
	}
	if err := os.WriteFile(certFile, pki.serverCertPEM, 0o600); err != nil {
		t.Fatalf("write cert: %v", err)
	}
	if err := os.WriteFile(keyFile, pki.serverKeyPEM, 0o600); err != nil {
		t.Fatalf("write key: %v", err)
	}
	t.Setenv(envConnectorTLSCert, certFile)
	t.Setenv(envConnectorTLSKey, keyFile)
	t.Setenv(envConnectorTLSCA, caFile)
}

// dialMTLSTestServer dials with a client certificate + CA root (mTLS client
// side), mirroring what a pinned connector SDK would do.
func dialMTLSTestServer(t *testing.T, srv *Server, pki *testPKI) *grpc.ClientConn {
	t.Helper()
	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(pki.caCertPEM) {
		t.Fatal("append CA to pool")
	}
	clientCert, err := tls.X509KeyPair(pki.clientCertPEM, pki.clientKeyPEM)
	if err != nil {
		t.Fatalf("client X509KeyPair: %v", err)
	}
	creds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{clientCert},
		RootCAs:      certPool,
	})
	conn, err := grpc.NewClient(srv.Addr().String(), grpc.WithTransportCredentials(creds))
	if err != nil {
		t.Fatalf("grpc.NewClient (mTLS): %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

// ---------------------------------------------------------------------------
// buildServerCreds unit tests (no socket needed)
// ---------------------------------------------------------------------------

func TestBuildServerCredsMissingEnvIsPlaintext(t *testing.T) {
	// No env vars at all → nil creds, nil error (plaintext fallback keeps the
	// existing backward-compatible behavior).
	t.Setenv(envConnectorTLSCert, "")
	t.Setenv(envConnectorTLSKey, "")
	t.Setenv(envConnectorTLSCA, "")
	creds, err := buildServerCreds()
	if err != nil {
		t.Fatalf("expected nil error without env, got %v", err)
	}
	if creds != nil {
		t.Fatal("expected nil creds without env (plaintext), got non-nil")
	}
}

func TestBuildServerCredsPartialEnvIsPlaintext(t *testing.T) {
	// Only one of three env vars set → still plaintext (mTLS requires all 3).
	t.Setenv(envConnectorTLSCert, "/does/not/matter.pem")
	t.Setenv(envConnectorTLSKey, "")
	t.Setenv(envConnectorTLSCA, "")
	creds, err := buildServerCreds()
	if err != nil {
		t.Fatalf("expected nil error for partial env, got %v", err)
	}
	if creds != nil {
		t.Fatal("expected nil creds for partial env (plaintext), got non-nil")
	}
}

func TestBuildServerCredsInvalidPEMError(t *testing.T) {
	// All three set but garbage content → descriptive error, no creds.
	dir := t.TempDir()
	writeFile := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
		return p
	}
	t.Setenv(envConnectorTLSCert, writeFile("bad-cert.pem", "not a pem"))
	t.Setenv(envConnectorTLSKey, writeFile("bad-key.pem", "not a pem"))
	t.Setenv(envConnectorTLSCA, writeFile("bad-ca.pem", "not a pem"))

	creds, err := buildServerCreds()
	if err == nil {
		t.Fatal("expected error for invalid PEM material")
	}
	if creds != nil {
		t.Fatal("expected nil creds on error")
	}
	if !strings.Contains(err.Error(), "WORKER_CONNECTOR_TLS") {
		t.Fatalf("error must point at the env knobs, got %q", err)
	}
}

// ---------------------------------------------------------------------------
// NewServer wiring
// ---------------------------------------------------------------------------

func TestNewServerSurfacesTLSCredError(t *testing.T) {
	// Garbage cert material + all 3 envs set → NewServer must fail (not
	// silently fall back to plaintext: the user explicitly asked for mTLS).
	dir := t.TempDir()
	writeFile := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
		return p
	}
	t.Setenv(envConnectorTLSCert, writeFile("cert.pem", "garbage"))
	t.Setenv(envConnectorTLSKey, writeFile("key.pem", "garbage"))
	t.Setenv(envConnectorTLSCA, writeFile("ca.pem", "garbage"))

	srv, err := NewServer("127.0.0.1:0", NewProxy(), "tok")
	if err == nil {
		srv.grpcServer.Stop()
		t.Fatal("expected NewServer error when TLS envs are set but material is invalid")
	}
}

// ---------------------------------------------------------------------------
// Full handshake over localhost (stdlib certs, in-process server)
// ---------------------------------------------------------------------------

func TestServerMTLSHandshakeAccepted(t *testing.T) {
	pki := newTestPKI(t)
	setTLSEnv(t, pki)
	srv, proxy := startTestServer(t, "mtls-tok")
	if !srv.TLSEnabled() {
		t.Fatal("expected TLSEnabled()=true when all WORKER_CONNECTOR_TLS_* envs are set")
	}

	conn := dialMTLSTestServer(t, srv, pki)
	defer conn.Close()
	stream, ack := connectAndRegisterWithExecID(t, conn, "mtls-tok", "exec-mtls-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true over mTLS, got %v reason=%q", ack.GetAccepted(), ack.GetReason())
	}
	if !proxy.HasStream("exec-mtls-1") {
		t.Fatal("expected stream mapped over mTLS connection")
	}

	// Clean Done over mTLS — the stream stays OPEN (Phase 2 warm pool): the
	// connector keeps its read loop for the next ExecuteJob.
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-mtls-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
	// No EOF after Done — the read loop continues; the client connection is
	// torn down by the test cleanup.
	if !proxy.HasStream("exec-mtls-1") {
		t.Fatal("stream must stay registered after Done (pool reuse)")
	}
}

func TestServerMTLSRejectsClientWithoutCert(t *testing.T) {
	pki := newTestPKI(t)
	setTLSEnv(t, pki)
	srv, _ := startTestServer(t, "mtls-tok")

	// Trust the CA but present NO client certificate — the server requires
	// and verifies client certs (tls.RequireAndVerifyClientCert), so the
	// handshake must fail before any RPC can run.
	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(pki.caCertPEM) {
		t.Fatal("append CA to pool")
	}
	creds := credentials.NewTLS(&tls.Config{RootCAs: certPool})
	conn, err := grpc.NewClient(srv.Addr().String(), grpc.WithTransportCredentials(creds))
	if err != nil {
		t.Fatalf("grpc.NewClient: %v", err)
	}
	defer conn.Close()

	client := pb.NewConnectorServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stream, err := client.Connect(ctx)
	if err == nil {
		if serr := stream.CloseSend(); serr != nil {
			t.Fatalf("CloseSend: %v", serr)
		}
		t.Fatal("expected Connect to fail without a client certificate under mTLS")
	}
}

// Guard: the plaintext path must remain fully operational when the TLS envs
// are absent (backward compatibility — existing deployments untouched).
func TestServerPlaintextStillWorksWithoutTLSEnv(t *testing.T) {
	t.Setenv(envConnectorTLSCert, "")
	t.Setenv(envConnectorTLSKey, "")
	t.Setenv(envConnectorTLSCA, "")
	srv, proxy := startTestServer(t, "secret")
	if srv.TLSEnabled() {
		t.Fatal("expected TLSEnabled()=false with no env")
	}
	conn := dialTestServer(t, srv) // insecure dial — must still work
	stream, ack := connectAndRegisterWithExecID(t, conn, "secret", "exec-plain-1")
	if !ack.GetAccepted() {
		t.Fatalf("expected accepted=true over plaintext, got %v", ack.GetAccepted())
	}
	if !proxy.HasStream("exec-plain-1") {
		t.Fatal("expected stream mapped over plaintext connection")
	}
	if err := stream.Send(&pb.ConnectorMessage{
		Message: &pb.ConnectorMessage_Done{
			Done: &pb.Done{ExecutionId: "exec-plain-1"},
		},
	}); err != nil {
		t.Fatalf("Send Done: %v", err)
	}
	if _, err := stream.Recv(); err == nil {
		t.Fatal("expected stream close after Done")
	}
}
