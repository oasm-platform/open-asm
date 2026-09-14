package connector

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	"google.golang.org/grpc/credentials"
)

// Server-side mutual TLS for the connector gRPC endpoint, env-gated for
// backward compatibility:
//
//	WORKER_CONNECTOR_TLS_CERT — path to the server certificate (PEM)
//	WORKER_CONNECTOR_TLS_KEY  — path to the server private key (PEM)
//	WORKER_CONNECTOR_TLS_CA   — path to the CA bundle that signs client certs (PEM)
//
// All three must be set for mTLS to activate. If any is missing the server
// stays on plaintext (the historic behavior), so existing deployments are
// unaffected until they opt in. When activated, connector clients MUST
// present a certificate signed by WORKER_CONNECTOR_TLS_CA
// (tls.RequireAndVerifyClientCert). Certificate contents are never logged —
// at most the on/off state.
const (
	envConnectorTLSCert = "WORKER_CONNECTOR_TLS_CERT"
	envConnectorTLSKey  = "WORKER_CONNECTOR_TLS_KEY"
	envConnectorTLSCA   = "WORKER_CONNECTOR_TLS_CA"
)

// buildServerCreds builds server-side mTLS credentials from the
// WORKER_CONNECTOR_TLS_* environment variables.
//
// Returns (nil, nil) — plaintext, no error — when any of the three env vars
// is missing (backward-compatible fallback). Returns a descriptive error when
// all three are set but the material cannot be loaded/parsed: an explicit mTLS
// request must never silently degrade to plaintext.
//
// Pure function (no socket, no listener): unit-testable without a live server.
func buildServerCreds() (credentials.TransportCredentials, error) {
	certFile := os.Getenv(envConnectorTLSCert)
	keyFile := os.Getenv(envConnectorTLSKey)
	caFile := os.Getenv(envConnectorTLSCA)
	if certFile == "" || keyFile == "" || caFile == "" {
		return nil, nil
	}

	serverCert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("connector mTLS: load %s/%s: %w", envConnectorTLSCert, envConnectorTLSKey, err)
	}

	caPEM, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("connector mTLS: read %s: %w", envConnectorTLSCA, err)
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("connector mTLS: %s contains no parseable PEM certificates", envConnectorTLSCA)
	}

	creds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientCAs:    caPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	})
	return creds, nil
}
