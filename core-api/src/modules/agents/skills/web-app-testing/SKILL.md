---
name: web-app-testing
description: OWASP-aligned methodology for authorized, non-destructive web application security testing — auth, access control, injection, SSRF, misconfiguration and sensitive-data exposure — with safe proofs and evidence capture. Use when assessing a web app or API in scope.
---

# Web application testing

Use this skill to assess an in-scope web application or API the way a professional does: methodically, by category, with safe proofs. Follow the OWASP Web Security Testing Guide (WSTG) structure and the OWASP Top 10 as the coverage checklist. Every test is read-mostly and non-destructive — you demonstrate a weakness, you do not exploit it for impact.

## When to use

- A web app, site or API is in scope and you need to test it for vulnerabilities.
- You found an entry point in recon and want to assess it by category.
- You need to produce evidence a weakness exists without harming the app.

## Goal and todo first (Agent mode)

`formulate_plan(steps)` with the pinned goal (e.g. "Assess the auth and access control of app.example.com for exploitable weaknesses, with evidence"), then `transition_step(id, "in_progress")`. First step: "Confirm scope (`retrieve_targets`) and map the app (`httpx`, `screenshot`, `fingerprint_technologies`)".

## Coverage checklist

Work the categories that fit the app; skip those that do not apply and say why. For each, test the few highest-value cases, not every permutation.

1. **Information gathering & configuration.** Server/framework versions (`fingerprint_technologies`), exposed admin panels, debug endpoints, default pages, directory listing, backup/`.git`/`.env` files, verbose errors, security headers and cookie flags.
2. **Authentication.** Weak or default credentials (a small, safe check — never a brute-force run), user enumeration via differing responses, missing lockout, token/session handling, password-reset flaws.
3. **Session management.** Session fixation, predictable or non-rotated tokens, missing `HttpOnly`/`Secure`/`SameSite`, logout that does not invalidate.
4. **Access control.** IDOR / broken object-level authorization, horizontal and vertical privilege escalation, forced browsing to privileged routes, missing function-level checks.
5. **Input handling / injection.** Reflected and stored XSS, SQL/NoSQL injection, command and template injection, path traversal, open redirect — probe with benign markers (see Safe proofs) and confirm from the response, not from a hunch.
6. **SSRF & request forgery.** Server-side request forgery on URL-taking parameters (prove with an out-of-band callback only if an interaction tool like `interactsh` is available), and CSRF on state-changing requests.
7. **Business logic & data exposure.** Rate-limit gaps, price/quantity tampering surfaces, mass assignment, and sensitive data (PII, secrets, tokens) returned where it should not be.
8. **API specifics.** Unauthenticated endpoints, excessive data exposure, missing object-level auth, and undocumented methods on documented routes.

## Tools

- Map and probe with built-in `httpx` and `screenshot`; read tech with `fingerprint_technologies`.
- Content discovery, crawling and template scanning (`katana`, `ffuf`, `gau`, `nuclei`, `wpscan`, …) only if `display_available_tools` lists them `isReady`. Point template scanners at one app with conservative rate limits.
- Craft and inspect individual requests with `execute_remote_command` (`curl -sS -i …`) and read long output with `read_tool_output` and a `pattern`.

## Safe proofs

- **Prove, do not exploit.** Use a benign, unique marker (a harmless string, an arithmetic test, a pointer to a resource you control) that shows the flaw without causing damage or reaching real data.
- **Injection**: demonstrate that input alters the query/response (e.g. a boolean or timing difference, an echoed marker) — do not dump databases, drop data, or run destructive payloads.
- **XSS**: show the marker reflected unescaped in a sensitive context — do not deploy real payloads against other users.
- **Access control**: show one unauthorized object or route is reachable — do not enumerate or alter real users' data at scale.
- **Secrets found in responses**: record that they are exposed and mask them in evidence; never use recovered credentials beyond confirming the exposure.

## Safety

- Only in-scope hosts (`retrieve_targets`). Respect approvals; if a step is rejected, do not retry it.
- No denial of service, no mass or automated destructive actions, no data exfiltration, no persistence.
- Stop at the minimum that proves the point; hand off confirmation of impact to `exploit-verification`.

## Evidence

For each candidate finding, capture the request and the response lines that prove it (trimmed, secrets masked), the exact URL/parameter, and whether it is Confirmed or needs verification. Pass confirmed items on for reporting.
