---
name: web-app-testing
description: OWASP-aligned methodology for authorized, non-destructive web application testing — authentication, authorization, injection, XSS, SSRF, file handling, business logic and misconfiguration — with the payload strategy for each class, evidence capture, and the bypasses to try before calling a class clean.
---

# Web application testing

Work by category, test the few highest-value cases in each, and prove the condition. Follow the OWASP WSTG structure and the OWASP Top 10 as the coverage checklist.

## Start from the surface

You need a mapped surface before you can test it: hosts, endpoints, parameters, forms, uploads, auth flows, roles, API versions. If you do not have one, get it first (see `reconnaissance`). Testing an unmapped app means testing the two pages you happened to see.

## The classes, in the order that pays

### 1. Access control
Every object id, tenant id, account id, file id, order id and path segment gets swapped for another identity's. Forced browsing to privileged routes, missing function-level checks, and hidden writable fields (mass assignment) belong here. To claim an authorization finding you need **two identities and both sides of the diff**: the request as the other user, and the same request as the owner.

### 2. Authentication and session
User enumeration from differing responses (status, message, timing), lockout and rate-limit behaviour on the login and reset flows, reset-token predictability and binding, session fixation, non-rotated tokens, cookie flags, logout invalidation, remember-me tokens, JWT algorithm confusion and claim trust, OAuth `state`/`nonce`/redirect binding, SAML signature validation.

### 3. Injection
Push through the parameter that reaches the sink, not every parameter you saw:
- **SQL**: quote/double-quote balance, boolean pair (`' AND 1=1` vs `' AND 1=2`), then time-based once the boolean works, then the DB-specific syntax for the fingerprint you have. Do not dump the database to prove it — a boolean or timing difference is the proof.
- **NoSQL**: operator injection (`{"$ne":null}`, `{"$gt":""}`, `[$ne]`), array-vs-scalar type confusion, and JSON parser quirks.
- **Command**: separator family (`;`, `|`, `&&`, newline), argument-position and quoting variants, and a benign callback (`sleep 5`, DNS lookup, `curl` to a host you control) rather than a shell.
- **Template**: arithmetic probe (`{{7*7}}`, `${7*7}`, `#{7*7}`, `<%= 7*7 %>`), then engine identification from the error, then the engine's own escape. Prove evaluation, not code execution.
- **Other**: LDAP, XPath, header and CRLF injection, log poisoning, CSV/formula injection, deserialization entry points.

### 4. XSS
The sink decides the payload. Reflected into HTML gets a tag; into an attribute gets the attribute's own quote broken; into a script block gets a JS fragment; into a URL gets a `javascript:` or attribute injection; into the DOM gets a source-to-sink path. Prove execution in a context that matters — an alert in a page nobody else renders is a low finding, not a false positive.

### 5. SSRF, redirects and file handling
URL-taking parameters are driven at internal addresses, cloud metadata, alternate schemes and redirect chains; when an out-of-band interaction tool is available, use it — a blind SSRF is proved by the callback. Open redirects come from the navigation target (return, next, url, redirect, callback, continue). File handling: path traversal and LFI in every file-reading parameter, and uploads validated on extension, content type, magic bytes, destination, overwrite and the processing pipeline that consumes the file.

### 6. Business logic
Multi-step workflows replayed out of order and out of sequence, quantity and price and coupon tampering, currency and rounding, refund and transfer races, one-time actions fired concurrently, and trust in client-supplied state. The proof is a changed outcome the business cares about, not a weird status code.

### 7. Misconfiguration and exposure
Debug and admin paths, directory listing, backups and VCS metadata, `.env`, verbose errors and stack traces, default credentials (a small, safe check — never a brute-force run), permissive CORS with credentials, missing security headers, cache behaviour that returns one user's page to another, and source maps that ship the source.

## Bypasses before you call a class clean

A 403 or a dropped payload is a puzzle, not a negative result:

- **Path and route**: case, trailing slash, double slash, dot segments, URL encoding and double encoding, semicolon parameters, added extension, `/./`, `%2f`, and the internal-path headers the gateway honours (`X-Original-URL`, `X-Rewrite-URL`, `X-Forwarded-For`, `X-Forwarded-Host`).
- **Method and verb**: swap `GET` for `POST`, add `X-HTTP-Method-Override`, try `OPTIONS` and `TRACE`.
- **Parser**: send the same value as JSON, form-encoded, XML, multipart, and as an array or object where a scalar was expected.
- **Payload**: alternate encodings (URL, unicode, HTML entities, base64, hex), comment and whitespace padding, case variation, alternate keyword synonyms the DB or engine accepts, chunked body, and a different content type.
- **Identity**: a lower-privileged account, an expired-but-accepted token, no token at all, and a token from a different tenant.

## Evidence

For each candidate: the exact request (method, URL, headers that matter, body), the response lines that differ from the baseline, the identity used, and the state of the app afterwards. Record the baseline next to the exploit — a difference proves nothing without the control next to it.

## Safety

Prove, do not damage. No denial of service, no mass automated destructive actions, no exfiltration beyond one record that proves reachability, no persistence. Stop at the minimum that settles the question and hand real exploitation impact to `exploit-verification`.

## Output

Per surface: the classes tested and their outcome, the confirmed candidates with evidence, the ruled-out ones with the control that blocked them, the untested ones with the reason, and the entry points most worth a deeper pass.
