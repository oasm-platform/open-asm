package security

import (
	"crypto/ecdh"
	"crypto/hpke"
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

// jobSecretsInfo is the HPKE info core-api seals job secrets with
// (JOB_SECRETS_INFO in job-secret-sealer.ts).
const jobSecretsInfo = "oasm job secrets v1"

var kem = hpke.DHKEM(ecdh.P256())

// EncryptionKey is the worker's HPKE key pair. The public half is sent on
// Join; core-api then seals every job's config and secret inputs to it, so
// they cross the network, proxies and logs only as ciphertext.
type EncryptionKey struct {
	priv hpke.PrivateKey
}

// LoadOrCreateEncryptionKey reads the private key stored at path, or creates
// one there (0600) on the first start. Keep it with the join token: core-api
// keeps the first key a worker identity registered.
func LoadOrCreateEncryptionKey(path string) (*EncryptionKey, error) {
	raw, err := os.ReadFile(path)
	if err == nil {
		priv, err := kem.NewPrivateKey(raw)
		if err != nil {
			return nil, fmt.Errorf("encryption key %s: %w", path, err)
		}
		return &EncryptionKey{priv: priv}, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	priv, err := kem.GenerateKey()
	if err != nil {
		return nil, err
	}
	raw, err = priv.Bytes()
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return nil, err
	}
	return &EncryptionKey{priv: priv}, nil
}

// PublicKey is the uncompressed P-256 point sent to core-api.
func (k *EncryptionKey) PublicKey() []byte {
	return k.priv.PublicKey().Bytes()
}

// OpenJobSecrets opens a Job.sealed bundle. It fails unless the bundle was
// sealed to this key for exactly this job and worker (the AAD).
func (k *EncryptionKey) OpenJobSecrets(enc, ciphertext []byte, jobID, workerID string) (config, inputs map[string]any, err error) {
	recipient, err := hpke.NewRecipient(enc, k.priv, hpke.HKDFSHA256(), hpke.AES256GCM(), []byte(jobSecretsInfo))
	if err != nil {
		return nil, nil, err
	}
	plain, err := recipient.Open([]byte(jobID+"|"+workerID), ciphertext)
	if err != nil {
		return nil, nil, fmt.Errorf("open job secrets: %w", err)
	}
	var bundle struct {
		Config map[string]any `json:"config"`
		Inputs map[string]any `json:"inputs"`
	}
	if err := json.Unmarshal(plain, &bundle); err != nil {
		return nil, nil, fmt.Errorf("open job secrets: %w", err)
	}
	return bundle.Config, bundle.Inputs, nil
}
