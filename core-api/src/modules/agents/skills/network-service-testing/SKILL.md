---
name: network-service-testing
description: Authorized, non-destructive assessment of exposed non-web services — TLS posture, SSH, mail, databases, caches, file shares, RPC, container and remote-access management planes — for dangerous exposure, weak crypto and missing authentication, with the check that proves each one.
---

# Network & service testing

You are assessing what is listening on a host, whether it should be, and whether it is configured safely. Exposure is often the whole finding; breaking in is not your job.

## Inventory first

1. What the workspace already knows: `list_network_ports`, `inspect_asset`, `fingerprint_technologies`.
2. What actually answers now: a port scan on the ports that matter, then a service and version scan on the open ones. Narrow and rate-limited beats a wide sweep that gets you blocked.
3. Banner and version per service. A version is a CVE lookup; a service with no version is a question, not a finding.

## Assess by service

- **TLS/SSL**: protocol versions (SSLv2/3, TLS 1.0/1.1 still enabled), cipher strength and order, certificate validity, expiry, hostname match, chain completeness, known-vulnerable libraries. `verify_tls_settings` for the recorded state, an active handshake check to confirm it now.
- **SSH**: protocol and software version, offered key-exchange, ciphers and MACs, whether password auth or root login is allowed, weak or deprecated algorithms. Report exposure and weak config; never guess credentials.
- **Mail (SMTP/IMAP/POP3)**: open-relay *indicators* (not a relay test that sends mail), missing STARTTLS, cleartext auth offered, banner and software version disclosure, permissive auth mechanisms.
- **Databases and caches** (MySQL, PostgreSQL, MSSQL, MongoDB, Redis, Memcached, Elasticsearch, Cassandra): the finding is reachability plus missing authentication. Confirm whether auth is required; never dump data. An unauthenticated Redis or an open Elasticsearch is a data-exposure finding on its own.
- **File shares and RPC** (SMB, NFS, RPC, WinRM): anonymous and guest access, exposed or world-readable shares, SMB signing and dialect, NFS export lists. Confirm the exposure; do not exfiltrate contents.
- **Remote access and management** (RDP, VNC, Telnet, IPMI, WinRM, Docker/Kubernetes API, Kubelet, etcd, Jenkins, Prometheus, Grafana, print and camera panels): public exposure of a management plane is the finding. A reachable management port is not proof of command execution — say what you proved, not what it implies.
- **Other**: FTP/SFTP anonymous login, LDAP anonymous bind, version-specific protocol flaws, UDP services responding to a probe.

## Rules

- No brute force, no credential spraying, no denial of service, no writes, no data extraction.
- A filtered port, a timeout or a reset is **inconclusive**, not closed. Say which it is.
- A publicly exposed service that should be internal is a finding regardless of its configuration — report it without logging in.
- Every claim carries the command and the decisive output lines.
- Confirm real exploitability elsewhere: this skill proves the condition exists, `exploit-verification` proves what it buys.

## Save what you find

`stm_write` each service as a fact: host, port, protocol, product, version, configuration observation, and the evidence. Later steps build CVE mapping and prioritization on those facts.

## Output

Per host: open ports with service and version, which exposures are dangerous and why, TLS and crypto specifics with the protocol and cipher names, authentication state where you confirmed it, and prioritized remediation (close the port, restrict the source, upgrade the protocol, require auth). Mark anything unconfirmed as unconfirmed.
