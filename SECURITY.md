# Security Policy

## Supported Versions

OASM is pre-1.0 (`0.0.1` in `package.json`). Only the latest `main` branch and the most recent [release](https://github.com/oasm-platform/open-asm/releases) receive security fixes. There is no LTS series.

| Version | Supported |
|---------|-----------|
| Latest `main` / latest release | ✅ |
| Older releases / tags | ❌ |

## Reporting a Vulnerability

**Use GitHub's private vulnerability reporting** — [open a draft Security Advisory](https://github.com/oasm-platform/open-asm/security/advisories/new). This keeps details private until a fix is ready. There is no dedicated security email address; do not post exploit details in public issues or Discord.

If the issue is clearly **not sensitive** (hardening idea, dependency bump, theoretical concern with no exploit path), a public [bug report](https://github.com/oasm-platform/open-asm/issues/new?template=bug-report.yml) is fine.

### What to include

- Affected component (`core-api`, `console`, `worker`, `oasm-connectors` manifest) and version/commit.
- Steps to reproduce or proof of concept.
- Impact assessment: what an attacker gains (data access, cross-tenant access, RCE, auth bypass).
- Your environment if relevant (Docker Compose, dev mode, production build).

### What to expect

- Reports are triaged by maintainers via the private advisory thread.
- There is **no formal SLA** — response time depends on severity and maintainer availability.
- Once triaged, fixes land on `main` and ship with the next release; reporters are credited unless they opt out.

## Scope Notes

- **Worker Docker socket is by design.** The worker mounts `/var/run/docker.sock` to spawn connector containers (`docker-compose.yml`, `worker/internal/runtime/docker.go`). The socket is root-equivalent on the host — only run trusted connector images, never expose the worker to untrusted networks.
- **Secrets live in `.env`, never in git.** `ENCRYPTION_KEYS` is order-sensitive (last key encrypts); `WORKER_API_KEY` must match what the API expects. Leaked-key rotation is an operator responsibility.
- **`.env` / deployment misconfiguration is out of code scope** for reports — flag it as a docs issue instead, unless the defect is in source code (e.g. an insecure default constant).

## Prior Audit (Point-in-Time)

A whitebox audit of `core-api` (cross-tenant isolation, IDOR, SQLi, auth controls) dated 2026-09-26 is recorded in [`docs/security-audit-report.md`](docs/security-audit-report.md). Remediation status per that report: 22 of 26 findings fixed on branch `security-patch-2026-10-03`; storage-bucket exposure (AE-02) was reverted at owner request and **still stands**; CORS/cookie/trusted-origin items were scoped as deployment configuration. Treat the report as a snapshot, not a guarantee — verify against current `main`.
