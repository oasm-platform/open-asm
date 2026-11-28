package egress

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

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

// Field caps mirror what core-api ingest keeps, so an oversize request cannot
// push a batch past the gRPC message limit only to be cut there anyway.
const (
	maxHeaders     = 100
	maxHeaderName  = 256
	maxHeaderValue = 8 * 1024
	maxPath        = 8 * 1024
	maxError       = 500
)

// cut shortens s to at most n bytes without splitting a rune: proto3 string
// fields must be valid UTF-8 or the whole batch fails to marshal.
func cut(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

type Header struct{ Name, Value string }

// HTTPEvent is one proxied request of an agent remote-command run.
type HTTPEvent struct {
	ID, SessionID, Scheme, Method, Host string
	// RunID is worker-local (never sent): it keys FlushRun.
	RunID                           string
	Port                            uint32
	Path                            string
	StatusCode                      uint32
	Outcome                         Outcome
	Error                           string
	RequestBytes, ResponseBytes     uint64
	SentAt, CompletedAt             time.Time
	RequestHeaders, ResponseHeaders []Header
	RequestBody, ResponseBody       []byte
	RequestBodyTruncated            bool
	ResponseBodyTruncated           bool
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
	case "cookie", "set-cookie":
		return true
	}
	// Broad on purpose: vendor headers (X-Auth-Key, Ocp-Apim-Subscription-Key,
	// Authentication...) vary too much to list, and over-masking costs little.
	for _, s := range []string{"auth", "key", "token", "secret", "password", "credential", "session"} {
		if strings.Contains(n, s) {
			return true
		}
	}
	return false
}

// MaskHeaders flattens h with credential-bearing values replaced, sorted by
// name so stored rows are stable regardless of map iteration order, and
// capped to the ingest limits.
func MaskHeaders(h http.Header) []Header {
	names := make([]string, 0, len(h))
	for k := range h {
		names = append(names, k)
	}
	sort.Strings(names)
	var out []Header
	for _, k := range names {
		mask := sensitiveHeader(k)
		name := cut(k, maxHeaderName)
		for _, v := range h[k] {
			if len(out) == maxHeaders {
				return out
			}
			if mask {
				v = masked
			}
			out = append(out, Header{Name: name, Value: cut(v, maxHeaderValue)})
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
	return path + "?" + maskPairs(query)
}

func maskPairs(query string) string {
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
	return strings.Join(parts, "&")
}

// MaskBody masks credential-like values in form and JSON bodies (password=,
// "access_token":...). A JSON body that does not parse, e.g. one cut at
// BodyCap, is kept as is; a form body is masked pair by pair either way.
func MaskBody(contentType string, body []byte) []byte {
	if len(body) == 0 {
		return body
	}
	mt, _, _ := mime.ParseMediaType(contentType)
	switch {
	case mt == "application/x-www-form-urlencoded":
		return []byte(maskPairs(string(body)))
	case mt == "application/json" || strings.HasSuffix(mt, "+json"):
		// UseNumber: a float64 round trip would corrupt large integer ids.
		dec := json.NewDecoder(bytes.NewReader(body))
		dec.UseNumber()
		var v any
		if dec.Decode(&v) != nil || !maskJSON(v) {
			return body
		}
		out, err := json.Marshal(v)
		if err != nil {
			return body
		}
		return out
	}
	return body
}

// maskJSON masks sensitive keys at any depth and reports whether it did.
func maskJSON(v any) bool {
	changed := false
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if sensitiveQueryKey(k) {
				t[k] = masked
				changed = true
			} else if maskJSON(child) {
				changed = true
			}
		}
	case []any:
		for _, child := range t {
			if maskJSON(child) {
				changed = true
			}
		}
	}
	return changed
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
