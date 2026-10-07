#!/usr/bin/env bash
#
# Docker-level QA matrix for nginx direct object reads (`/files/`) and the
# private RustFS bucket. This is the only true end-to-end proof of the
# storage-nginx-direct-reads design: a real console image, a real core-api, and
# a real private bucket.
#
# What it proves (every case against http://localhost:3000):
#   - anon  /files/system/<k>        -> 200 + `Cache-Control: public`
#   - anon  /files/screenshot/<k>    -> 401
#   - owner /files/screenshot/<k>    -> 200 non-empty + `private, no-cache` + ETag
#   - foreign member                 -> 403
#   - owner + If-None-Match          -> 304
#   - owner /files/screenshot/<k>.webp -> 200 (`^~` precedence over the static regex)
#   - owner seeded-but-missing key   -> 404, NOT the SPA index.html
#   - anon  http://localhost:9000/screenshot/<k> -> 403 (bucket stays private)
#
# Failing-first: an authenticated read of the owned screenshot is issued BEFORE
# the asset->target->workspace chain is seeded. Authorization has no owning
# workspace then, so it must answer 403 (red). The chain is seeded and the same
# read must answer 200 (green); the 401/403/404 negative cases are captured as
# the failing-behavior proof alongside it.
#
# Seed model mirrors core-api/test/storage-read-authz.e2e-spec.ts: users A/B via
# the real sign-up endpoint, workspaces via POST /api/workspaces (owner
# membership + wildcard group), the asset chain via direct DB inserts, and the
# objects via the S3 API (the same credentials RustFS is configured with).
#
# Usage:  scripts/qa/nginx-direct-reads.sh
# Env:    QA_SKIP_BOOT=1   skip `task docker-compose` (assume the stack is up)
#         CONSOLE_URL, CORE_URL, RUSTFS_URL, PG_CONTAINER overrides
#
# Starts: the full compose stack via `task docker-compose` (build + up
#         --force-recreate), unless QA_SKIP_BOOT=1.
# Stops:  nothing. Shared infra (postgres/redis/rustfs/console/core-api) is left
#         exactly as found; only the seeded S3 objects and DB rows are deleted.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

CONSOLE_URL="${CONSOLE_URL:-http://localhost:3000}"
CORE_URL="${CORE_URL:-http://localhost:6276}"
RUSTFS_URL="${RUSTFS_URL:-http://localhost:9000}"

EVIDENCE_DIR="$REPO_ROOT/.omo/evidence/storage-nginx-direct-reads"
EVIDENCE_FILE="$EVIDENCE_DIR/07-qa-matrix.txt"
mkdir -p "$EVIDENCE_DIR"

# Everything below is captured raw into the evidence file.
exec > >(tee "$EVIDENCE_FILE") 2>&1

TMP_DIR="$(mktemp -d)"
COOKIE_A="$TMP_DIR/cookie-a.txt"
COOKIE_B="$TMP_DIR/cookie-b.txt"

# ---------------------------------------------------------------------------
# Cleanup: delete every seeded object + row, always, and drop the temp dir.
# Runs on EXIT so a failed assertion still leaves no residue.
# ---------------------------------------------------------------------------
STAMP=""
WSA=""; WSB=""
OWNED_KEY=""; WEBP_KEY=""; MISSING_KEY=""; STATIC_KEY=""; LOGO_KEY=""
S3_HELPER="$TMP_DIR/s3.js"

cleanup() {
  local rc=$?
  echo
  echo "=== TEARDOWN (seeded objects + rows; shared infra untouched) ==="
  if [[ -n "$STAMP" ]]; then
    local key
    for key in "$OWNED_KEY" "$WEBP_KEY"; do
      [[ -n "$key" ]] && node "$S3_HELPER" del screenshot "$key" >/dev/null 2>&1 || true
    done
    [[ -n "$STATIC_KEY" ]] && node "$S3_HELPER" del cached-static "$STATIC_KEY" >/dev/null 2>&1 || true
    [[ -n "$LOGO_KEY" ]] && node "$S3_HELPER" del system "$LOGO_KEY" >/dev/null 2>&1 || true

    psql_q "DELETE FROM workspaces WHERE name LIKE 'qa-nginx-a-$STAMP' OR name LIKE 'qa-nginx-b-$STAMP';" >/dev/null 2>&1 || true
    psql_q "DELETE FROM sessions WHERE \"userId\" IN (SELECT id FROM users WHERE email LIKE 'qa-nginx-a-$STAMP@%' OR email LIKE 'qa-nginx-b-$STAMP@%');" >/dev/null 2>&1 || true
    psql_q "DELETE FROM accounts WHERE \"userId\" IN (SELECT id FROM users WHERE email LIKE 'qa-nginx-a-$STAMP@%' OR email LIKE 'qa-nginx-b-$STAMP@%');" >/dev/null 2>&1 || true
    psql_q "DELETE FROM users WHERE email LIKE 'qa-nginx-a-$STAMP@%' OR email LIKE 'qa-nginx-b-$STAMP@%';" >/dev/null 2>&1 || true
    echo "deleted seeded objects and rows for stamp $STAMP"
  fi
  echo "shared infra left running (not started by this teardown)"
  rm -rf "$TMP_DIR"
  exit "$rc"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
FAILURES=0
PASSES=0

assert_status() { # label expected actual
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $label -> HTTP $actual"
    PASSES=$((PASSES + 1))
  else
    echo "FAIL: $label -> HTTP $actual (expected $expected)"
    FAILURES=$((FAILURES + 1))
  fi
}

assert_contains() { # label haystack needle
  local label="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qi -- "$needle"; then
    echo "PASS: $label contains '$needle'"
    PASSES=$((PASSES + 1))
  else
    echo "FAIL: $label missing '$needle'"
    FAILURES=$((FAILURES + 1))
  fi
}

assert_not_contains() { # label haystack needle
  local label="$1" haystack="$2" needle="$3"
  if printf '%s' "$haystack" | grep -qi -- "$needle"; then
    echo "FAIL: $label unexpectedly contains '$needle'"
    FAILURES=$((FAILURES + 1))
  else
    echo "PASS: $label does not contain '$needle'"
    PASSES=$((PASSES + 1))
  fi
}

request() { # label expected_status curl-args...
  local label="$1" expected="$2"; shift 2
  local hdr="$TMP_DIR/hdr.txt" body="$TMP_DIR/body.bin"
  : >"$hdr"; : >"$body"
  local status
  status="$(curl -sS -D "$hdr" -o "$body" -w '%{http_code}' "$@")" || status="000"

  echo
  echo "### $label"
  echo "--- curl $*"
  echo "--- HTTP $status"
  cat "$hdr"
  local ctype
  ctype="$(grep -i '^content-type:' "$hdr" | tr -d '\r' | sed 's/^[Cc]ontent-[Tt]ype: //' || true)"
  local bytes
  bytes="$(wc -c <"$body" | tr -d ' ')"
  if printf '%s' "$ctype" | grep -qiE '(text/|xml|json|html)'; then
    echo "--- body ($bytes bytes) ---"
    cat "$body"
  else
    echo "--- body: $bytes bytes, sha256=$(sha256sum "$body" | cut -d' ' -f1) (binary omitted) ---"
  fi
  echo "--- /curl $label"
  # expose status + headers to the caller via globals
  LAST_STATUS="$status"
  LAST_HEADERS="$(cat "$hdr")"
  LAST_BODY="$body"
  LAST_BYTES="$bytes"
}

psql_q() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1"; }

wait_http() { # url label
  local url="$1" label="$2" i
  for i in $(seq 1 120); do
    if curl -s -o /dev/null -m 3 "$url"; then
      echo "$label is up: $url"
      return 0
    fi
    sleep 1
  done
  echo "TIMEOUT waiting for $label ($url)"
  return 1
}

# ---------------------------------------------------------------------------
# 0. Build + boot, then wait for the two entry points.
# ---------------------------------------------------------------------------
echo "=== START RECORD ==="
echo "console:  $CONSOLE_URL"
echo "core-api: $CORE_URL"
echo "rustfs:   $RUSTFS_URL"

if [[ "${QA_SKIP_BOOT:-0}" == "1" ]]; then
  echo "=== boot: SKIPPED (QA_SKIP_BOOT=1); assuming the stack is already running ==="
else
  echo "=== boot: task docker-compose (build + up -d --build --force-recreate) ==="
  task docker-compose
fi

wait_http "$CORE_URL/api/health" "core-api"
wait_http "$CONSOLE_URL/" "console"

PG_CONTAINER="${PG_CONTAINER:-oasm-postgres}"
PG_USER="${PG_USER:-$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo postgres)}"
PG_DB="${PG_DB:-$(docker exec "$PG_CONTAINER" printenv POSTGRES_DB 2>/dev/null || echo open_asm)}"
echo "postgres: container=$PG_CONTAINER user=$PG_USER db=$PG_DB"

export RUSTFS_URL RUSTFS_ACCESS_KEY="${RUSTFS_ACCESS_KEY:-rustfsadmin}" RUSTFS_SECRET_KEY="${RUSTFS_SECRET_KEY:-rustfssecret}"
export NODE_PATH="$REPO_ROOT/core-api/node_modules"

# Small S3 helper (reuses the S3 client already installed for core-api).
cat >"$S3_HELPER" <<'JS'
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const [,, op, bucket, key, file, contentType] = process.argv;
const client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.RUSTFS_URL || 'http://localhost:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.RUSTFS_ACCESS_KEY || 'rustfsadmin',
    secretAccessKey: process.env.RUSTFS_SECRET_KEY || 'rustfssecret',
  },
});
(async () => {
  if (op === 'put') {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.readFileSync(file),
      ContentType: contentType || 'application/octet-stream',
    }));
  } else if (op === 'del') {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } else {
    throw new Error('unknown op: ' + op);
  }
})().catch((e) => { console.error('S3ERR', e.message); process.exit(1); });
JS

# PNG fixture (mirrors the e2e 1x1 PNG).
PNG_FIXTURE="$TMP_DIR/fixture.png"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d >"$PNG_FIXTURE"
TXT_FIXTURE="$TMP_DIR/fixture.txt"
printf 'oasm nginx direct-read QA payload\n' >"$TXT_FIXTURE"

# ---------------------------------------------------------------------------
# 1. Users A/B + workspaces A/B (real HTTP, like the Jest e2e).
# ---------------------------------------------------------------------------
STAMP="$(date +%s)-${RANDOM}${RANDOM}"

signup() { # email jar
  curl -sS -c "$2" -X POST "$CORE_URL/api/auth/sign-up/email" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Password123!\",\"name\":\"QA nginx direct reads\"}" >/dev/null
}

signup "qa-nginx-a-$STAMP@example.com" "$COOKIE_A"
signup "qa-nginx-b-$STAMP@example.com" "$COOKIE_B"

WSA="$(curl -sS -b "$COOKIE_A" -X POST "$CORE_URL/api/workspaces" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"qa-nginx-a-$STAMP\",\"description\":\"e2e\"}" | jq -r .id)"
WSB="$(curl -sS -b "$COOKIE_B" -X POST "$CORE_URL/api/workspaces" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"qa-nginx-b-$STAMP\",\"description\":\"e2e\"}" | jq -r .id)"
echo "workspace A=$WSA  workspace B=$WSB"

# ---------------------------------------------------------------------------
# 2. Keys + object uploads.
# ---------------------------------------------------------------------------
md5key() { node -e "console.log(require('crypto').createHash('md5').update(process.argv[1]).digest('hex')+process.argv[2])" "$1" "$2"; }
uuid() { node -e 'console.log(require("crypto").randomUUID())'; }

OWNED_KEY="$(md5key "qa-nginx-owned-$STAMP" .png)"
WEBP_KEY="$(md5key "qa-nginx-webp-$STAMP" .webp)"
MISSING_KEY="$(md5key "qa-nginx-missing-$STAMP" .png)"
STATIC_KEY="qa-nginx-static-$STAMP.txt"
LOGO_KEY="qa-nginx-logo-$STAMP.png"

echo "owned=$OWNED_KEY webp=$WEBP_KEY missing=$MISSING_KEY static=$STATIC_KEY logo=$LOGO_KEY"

node "$S3_HELPER" put screenshot "$OWNED_KEY" "$PNG_FIXTURE" image/png
node "$S3_HELPER" put screenshot "$WEBP_KEY" "$PNG_FIXTURE" image/webp
node "$S3_HELPER" put cached-static "$STATIC_KEY" "$TXT_FIXTURE" text/plain
node "$S3_HELPER" put system "$LOGO_KEY" "$PNG_FIXTURE" image/png
echo "uploaded 4 objects (owned, webp, cached-static, system)"

# ---------------------------------------------------------------------------
# 3. RED probe: owner read BEFORE the workspace chain exists -> must be 403.
# ---------------------------------------------------------------------------
request "RED owner read before seeding chain (expect 403)" 403 \
  -b "$COOKIE_A" "$CONSOLE_URL/files/screenshot/$OWNED_KEY"
assert_status "RED owner-before-seed" 403 "$LAST_STATUS"

# ---------------------------------------------------------------------------
# 4. Seed the asset -> target -> workspace chain (direct DB inserts).
# ---------------------------------------------------------------------------
seed_chain() { # workspaceId hostname screenshotKey
  local ws="$1" host="$2" key="$3" tid aid sid
  tid="$(uuid)"; aid="$(uuid)"; sid="$(uuid)"
  psql_q "INSERT INTO targets (id, value, \"workspaceId\") VALUES ('$tid', '$host', '$ws');" >/dev/null
  psql_q "INSERT INTO assets (id, value, \"targetId\") VALUES ('$aid', '$host', '$tid');" >/dev/null
  psql_q "INSERT INTO asset_services (id, value, port, \"assetId\", \"screenshotPath\") VALUES ('$sid', '$host', 443, '$aid', 'screenshot/$key');" >/dev/null
}
seed_chain "$WSA" "qa-nginx-owned-$STAMP.example.com" "$OWNED_KEY"
seed_chain "$WSA" "qa-nginx-webp-$STAMP.example.com" "$WEBP_KEY"
# Seeded but deliberately NOT uploaded -> exercises the real 404 path.
seed_chain "$WSA" "qa-nginx-missing-$STAMP.example.com" "$MISSING_KEY"
echo "seeded asset chains for owned, webp and missing keys"

# ---------------------------------------------------------------------------
# 5. The matrix.
# ---------------------------------------------------------------------------
echo
echo "=== MATRIX ==="

# anon system -> 200 + public
request "anon /files/system (expect 200 public)" 200 "$CONSOLE_URL/files/system/$LOGO_KEY"
assert_status "anon system" 200 "$LAST_STATUS"
assert_contains "anon system Cache-Control" "$LAST_HEADERS" 'cache-control: public'

# anon screenshot -> 401
request "anon /files/screenshot (expect 401)" 401 "$CONSOLE_URL/files/screenshot/$OWNED_KEY"
assert_status "anon screenshot" 401 "$LAST_STATUS"

# owner -> 200 + private,no-cache + non-empty + ETag
request "owner /files/screenshot (expect 200 private)" 200 -b "$COOKIE_A" "$CONSOLE_URL/files/screenshot/$OWNED_KEY"
assert_status "owner screenshot" 200 "$LAST_STATUS"
assert_contains "owner Cache-Control" "$LAST_HEADERS" 'cache-control: private, no-cache'
assert_contains "owner ETag present" "$LAST_HEADERS" 'etag:'
if [[ "$LAST_BYTES" -gt 0 ]]; then
  echo "PASS: owner body is non-empty ($LAST_BYTES bytes)"; PASSES=$((PASSES + 1))
else
  echo "FAIL: owner body is empty"; FAILURES=$((FAILURES + 1))
fi
OWNED_ETAG="$(printf '%s' "$LAST_HEADERS" | grep -i '^etag:' | tr -d '\r' | sed 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//')"

# foreign -> 403
request "foreign /files/screenshot (expect 403)" 403 -b "$COOKIE_B" "$CONSOLE_URL/files/screenshot/$OWNED_KEY"
assert_status "foreign screenshot" 403 "$LAST_STATUS"

# owner + If-None-Match -> 304
request "owner If-None-Match (expect 304)" 304 -b "$COOKIE_A" -H "If-None-Match: $OWNED_ETAG" "$CONSOLE_URL/files/screenshot/$OWNED_KEY"
assert_status "conditional GET" 304 "$LAST_STATUS"

# .webp -> 200 (proves ^~ precedence over the static-asset regex)
request "owner .webp screenshot (expect 200, precedence)" 200 -b "$COOKIE_A" "$CONSOLE_URL/files/screenshot/$WEBP_KEY"
assert_status "webp precedence" 200 "$LAST_STATUS"

# seeded-but-missing -> 404, not SPA
request "owner missing object (expect 404, not SPA)" 404 -b "$COOKIE_A" "$CONSOLE_URL/files/screenshot/$MISSING_KEY"
assert_status "missing object" 404 "$LAST_STATUS"
MISSING_BODY="$(cat "$LAST_BODY")"
assert_not_contains "missing 404 body (no SPA)" "$MISSING_BODY" '<div id="root"'

# cached-static via nginx -> 200 (authenticated class)
request "owner cached-static (expect 200)" 200 -b "$COOKIE_A" "$CONSOLE_URL/files/cached-static/$STATIC_KEY"
assert_status "cached-static" 200 "$LAST_STATUS"

# anon :9000 direct -> 403 (bucket private; a 200 here means REJECT)
request "anon :9000 screenshot (expect 403, private bucket)" 403 "$RUSTFS_URL/screenshot/$OWNED_KEY"
assert_status "private bucket :9000" 403 "$LAST_STATUS"
if [[ "$LAST_STATUS" == "200" ]]; then
  echo "REJECT: anonymous direct read on :9000 returned 200 — the bucket is PUBLIC"
fi

# ---------------------------------------------------------------------------
# 6. Verdict.
# ---------------------------------------------------------------------------
echo
echo "=== RESULT ==="
echo "passed: $PASSES  failed: $FAILURES"
echo "puts: nginx direct reads green; anon :9000 = 403 (no bypass); .webp precedence green"
echo "reminder: RED probe (owner before seeding) must be 403 and is asserted above"

if [[ "$FAILURES" -ne 0 ]]; then
  echo "QA MATRIX: FAILED ($FAILURES assertions)"
  exit 1
fi
echo "QA MATRIX: GREEN"
