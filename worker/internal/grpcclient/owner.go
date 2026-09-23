package grpcclient

import (
	"crypto/sha256"
	"encoding/hex"
)

// OwnerID returns this worker's ownership fingerprint: the first 16 hex chars
// of sha256("sig:"+WORKER_SIGNATURE) when a signature is configured, else
// sha256("tok:"+<join token>), else "" when the worker has no identity yet
// (first-ever run, pre-join).
//
// It is stamped into connector container labels (oasm.worker_id) at Create
// time so a restarted worker's ReconcileOrphans can distinguish its own
// orphans from a sibling worker's live containers on a shared engine. The raw
// token/signature never leaves this process. Signature wins over token because
// operators can pin it across token rotation.
//
// Computed on demand (immutable signature, RWMutex-guarded token) — no cached
// field to refresh after Join.
func (c *Client) OwnerID() string {
	if c.signature != "" {
		return ownerIDHash("sig:" + c.signature)
	}
	if tok := c.auth.currentToken(); tok != "" {
		return ownerIDHash("tok:" + tok)
	}
	return ""
}

// ownerIDHash returns the first 16 hex chars of sha256(s).
func ownerIDHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])[:16]
}
