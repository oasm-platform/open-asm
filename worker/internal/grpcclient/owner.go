package grpcclient

import (
	"crypto/sha256"
	"encoding/hex"
)

// OwnerID returns this worker's ownership fingerprint: the first 16 hex chars
// of sha256("tok:"+<join token>), or "" when the worker has no identity yet
// (first-ever run, pre-join).
//
// It is stamped into connector container labels (oasm.worker_id) at Create
// time so a restarted worker's ReconcileOrphans can distinguish its own
// orphans from a sibling worker's live containers on a shared engine. The raw
// token never leaves this process.
//
// Computed on demand (RWMutex-guarded token) — no cached field to refresh
// after Join.
func (c *Client) OwnerID() string {
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
