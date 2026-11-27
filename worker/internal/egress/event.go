package egress

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Outcome values match the proto enum numbers so the gRPC layer can cast.
type Outcome int

const (
	OutcomeAllowed       Outcome = 1
	OutcomeDenied        Outcome = 2
	OutcomeUpstreamError Outcome = 3
	OutcomeCancelled     Outcome = 4
)

// BodyCap bounds how much of each request and response body is kept.
const BodyCap = 64 * 1024

const masked = "***"

type Header struct{ Name, Value string }

// HTTPEvent is one proxied request of an agent remote-command run.
type HTTPEvent struct {
	ID, SessionID, Scheme, Method, Host string
	Port                                uint32
	Path                                string
	StatusCode                          uint32
	Outcome                             Outcome
	Error                               string
	RequestBytes, ResponseBytes         uint64
	SentAt, CompletedAt                 time.Time
	RequestHeaders, ResponseHeaders     []Header
	RequestBody, ResponseBody           []byte
	RequestBodyTruncated                bool
	ResponseBodyTruncated               bool
}

// NewEventID returns a UUIDv7 so ids sort by creation time in the database.
func NewEventID() string {
	var b [16]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read never fails (Go 1.24+)
	var ts [8]byte
	binary.BigEndian.PutUint64(ts[:], uint64(time.Now().UnixMilli()))
	copy(b[:6], ts[2:])
	b[6] = 0x70 | b[6]&0x0f
	b[8] = 0x80 | b[8]&0x3f
	var s [36]byte
	hex.Encode(s[0:8], b[0:4])
	s[8] = '-'
	hex.Encode(s[9:13], b[4:6])
	s[13] = '-'
	hex.Encode(s[14:18], b[6:8])
	s[18] = '-'
	hex.Encode(s[19:23], b[8:10])
	s[23] = '-'
	hex.Encode(s[24:], b[10:])
	return string(s[:])
}

func sensitiveHeader(name string) bool {
	n := strings.ToLower(name)
	switch n {
	case "authorization", "proxy-authorization", "cookie", "set-cookie", "x-auth", "x-api-key":
		return true
	}
	for _, s := range []string{"api-key", "apikey", "token", "secret", "password"} {
		if strings.Contains(n, s) {
			return true
		}
	}
	return false
}

// MaskHeaders flattens h with credential-bearing values replaced, sorted by
// name so stored rows are stable regardless of map iteration order.
func MaskHeaders(h http.Header) []Header {
	names := make([]string, 0, len(h))
	for k := range h {
		names = append(names, k)
	}
	sort.Strings(names)
	var out []Header
	for _, k := range names {
		mask := sensitiveHeader(k)
		for _, v := range h[k] {
			if mask {
				v = masked
			}
			out = append(out, Header{Name: k, Value: v})
		}
	}
	return out
}

func sensitiveQueryKey(key string) bool {
	k := strings.ToLower(key)
	for _, s := range []string{"token", "key", "secret", "password", "passwd", "sig", "signature", "auth", "session", "code"} {
		if strings.Contains(k, s) {
			return true
		}
	}
	return false
}

// MaskQuery masks credential-like query values. It edits the raw string
// instead of round-tripping url.Values, which would reorder and re-encode
// parameters and make the stored path differ from what was sent.
func MaskQuery(rawPath string) string {
	path, query, ok := strings.Cut(rawPath, "?")
	if !ok || query == "" {
		return rawPath
	}
	parts := strings.Split(query, "&")
	for i, p := range parts {
		k, _, hasValue := strings.Cut(p, "=")
		if !hasValue {
			continue
		}
		key := k
		if dec, err := url.QueryUnescape(k); err == nil {
			key = dec
		}
		if sensitiveQueryKey(key) {
			parts[i] = k + "=" + masked
		}
	}
	return path + "?" + strings.Join(parts, "&")
}

// bodyCapture keeps the first BodyCap bytes written and counts them all.
type bodyCapture struct {
	buf   []byte
	total uint64
}

func (c *bodyCapture) Write(p []byte) (int, error) {
	c.total += uint64(len(p))
	if room := BodyCap - len(c.buf); room > 0 {
		c.buf = append(c.buf, p[:min(room, len(p))]...)
	}
	return len(p), nil
}

func (c *bodyCapture) truncated() bool { return c.total > BodyCap }

// captureReader tees a request body into a bodyCapture as it is forwarded.
type captureReader struct {
	io.ReadCloser
	c *bodyCapture
}

func (r captureReader) Read(p []byte) (int, error) {
	n, err := r.ReadCloser.Read(p)
	_, _ = r.c.Write(p[:n])
	return n, err
}
