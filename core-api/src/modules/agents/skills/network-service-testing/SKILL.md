---
name: network-service-testing
description: Methodology for authorized, non-destructive assessment of exposed non-web network services — TLS/SSL posture, SSH, mail, databases, file shares, admin and remote-access ports — for misconfiguration, weak crypto and dangerous exposure. Use when testing open ports and services rather than web apps.
---

# Network & service testing

Use this skill to assess the exposed non-web services on an in-scope host: what is listening, whether it should be, and whether it is configured safely. The goal is to find dangerous exposure and misconfiguration — not to break in. Everything here is read-mostly and non-destructive; you identify and demonstrate a weakness, you do not brute-force or disrupt the service.

## When to use

- Recon found open ports and you need to assess the services behind them.
- A host exposes TLS, SSH, mail, a database, a file share or an admin/remote-access port.
- You need to judge whether a listening service is safely configured or dangerously exposed.

## Goal and todo first (Agent mode)

`formulate_plan(steps)`, then `transition_step(id, "in_progress")`. Goal, e.g. "Assess the exposed services on 203.0.113.10 for misconfiguration and weak TLS, with evidence". First step: confirm scope (`retrieve_targets`) and read known ports (`list_network_ports`) and TLS (`verify_tls_settings`).

## How to work

1. **Inventory the listening services.** `list_network_ports` for what the workspace knows; `naabu` (built-in) to confirm open ports; a service/version scanner (`nmap`, if `display_available_tools` lists it `isReady`) for banners and versions on the ports that matter. Keep scans narrow and rate-limited.
2. **Classify each service.** For every open port decide: should this be internet-facing at all? Management, database, and file-share ports exposed publicly are themselves findings regardless of their config.
3. **Assess by service type** (the ones that apply):
   - **TLS/SSL** (443, 8443, mail/DB TLS): `verify_tls_settings` for protocol versions, cipher strength, certificate validity, expiry and hostname match. Flag deprecated protocols (SSLv3, TLS 1.0/1.1), weak ciphers, expired or mismatched certs.
   - **SSH**: version, offered key-exchange/ciphers/MACs, whether password auth is allowed. Report weak algorithms and exposure — do not attempt credential guessing.
   - **Mail (SMTP/IMAP/POP)**: open relay *indicators*, missing STARTTLS, exposed auth. Check configuration signals, not live abuse.
   - **Databases / caches (MySQL, Postgres, MongoDB, Redis, Elastic, …)**: the real finding is usually exposure itself — reachable from outside, or unauthenticated. Confirm reachability and auth-required state; never dump data.
   - **File shares / RPC (SMB, NFS, RPC)**: anonymous/guest readability and exposed shares — confirm the exposure, do not exfiltrate contents.
   - **Admin & remote access (RDP, VNC, Telnet, management consoles)**: these should rarely be public; exposure and weak/legacy protocols are the finding.
4. **Confirm, don't intrude.** Verify a weakness exists with the lightest check; hand real confirmation to `exploit-verification`.

## Tools

- Built-in and reliable: `naabu` (ports), `httpx` (service probing), and the workspace tools `list_network_ports`, `verify_tls_settings`, `fingerprint_technologies`.
- Deeper probes (`nmap` scripts, `testssl`, …) only when `display_available_tools` shows them ready; otherwise note the gap and work with what you have.
- `execute_remote_command` for safe one-off checks (`dig`, `curl -sI`, a single banner grab). Read long output with `read_tool_output` and a `pattern`.

## Safety

- Only in-scope hosts (`retrieve_targets`). Respect approvals; do not retry a rejected step.
- No brute force, no credential spraying, no denial of service, no data exfiltration, no changes to the service.
- A service that is simply exposed when it should not be is a finding on its own — report it without trying to log in.

## Output

Per host: the open ports and the service/version on each, which exposures are dangerous and why, TLS/crypto weaknesses with specifics, and prioritized remediation (close the port, restrict the source, upgrade the protocol, require auth). Mark anything unconfirmed as such.
