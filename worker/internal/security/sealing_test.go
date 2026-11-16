package security

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

// Sealed by core-api's sealer (@hpke/core, job-secret-sealer.ts) to the key
// below, with AAD "job-1|worker-1": the interop contract between the two.
const (
	fixturePrivateKey = "7585c485a1a72bc3b66395caaa37a1940848a5acba85dfff49a0a2b446792360"
	fixtureEnc        = "041d1ac1cf51a32e95697e1b49df24a9c17531dc5082e13d19f75613022acd323a325ab9651dcbf376c3d1544a65b5e2a68077c98eb9d8aeaec4e24727653e688e"
	fixtureCiphertext = "7950c5002c44390fbb21f471ad1716712370fd4b03bab686103b30c9345a5123928e68c5d8f99bb560aa655f30bcf42114b67a296f60ebbd0655f3050b3bf4e70814171c3be8262359fc7592f474534742c86d2ffe86"
)

func fixtureKey(t *testing.T) *EncryptionKey {
	t.Helper()
	path := filepath.Join(t.TempDir(), "worker.key")
	raw, _ := hex.DecodeString(fixturePrivateKey)
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	key, err := LoadOrCreateEncryptionKey(path)
	if err != nil {
		t.Fatalf("load fixture key: %v", err)
	}
	return key
}

func TestOpenJobSecretsOpensWhatCoreSealed(t *testing.T) {
	enc, _ := hex.DecodeString(fixtureEnc)
	ct, _ := hex.DecodeString(fixtureCiphertext)

	config, inputs, err := fixtureKey(t).OpenJobSecrets(enc, ct, "job-1", "worker-1")
	if err != nil {
		t.Fatalf("OpenJobSecrets: %v", err)
	}
	if config["apiKey"] != "fixture-key" || inputs["token"] != "fixture-token" {
		t.Fatalf("got config=%v inputs=%v", config, inputs)
	}
}

func TestOpenJobSecretsRefusesAnotherJobOrWorker(t *testing.T) {
	enc, _ := hex.DecodeString(fixtureEnc)
	ct, _ := hex.DecodeString(fixtureCiphertext)
	key := fixtureKey(t)

	if _, _, err := key.OpenJobSecrets(enc, ct, "job-2", "worker-1"); err == nil {
		t.Fatal("opened secrets sealed for another job")
	}
	if _, _, err := key.OpenJobSecrets(enc, ct, "job-1", "worker-2"); err == nil {
		t.Fatal("opened secrets sealed for another worker")
	}
}

func TestEncryptionKeyIsCreatedOnceAndKept(t *testing.T) {
	path := filepath.Join(t.TempDir(), "worker.key")

	first, err := LoadOrCreateEncryptionKey(path)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	second, err := LoadOrCreateEncryptionKey(path)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}

	if !bytes.Equal(first.PublicKey(), second.PublicKey()) || len(first.PublicKey()) != 65 {
		t.Fatalf("public key not kept: %x vs %x", first.PublicKey(), second.PublicKey())
	}
}
