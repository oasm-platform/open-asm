---
name: osint-and-assets
description: Passive asset discovery and ownership-drift analysis — certificate transparency, ASN and netblock expansion, certificate fingerprint pivoting, virtual hosts, cloud storage and third-party services, and the infrastructure a target depends on but no longer controls. Load when enumerating what an organization exposes, or when a target's real surface is larger than its domain list.
---

# OSINT & asset discovery

Passive first: everything here can be learned without touching the target, and what you learn tells you where to point the active tools.

## Certificate transparency

The fastest way to a real host list is the certificates the organization already published.

- Query CT logs for the domain and read every name out of the result (the common-name and the SAN list). Wildcard entries tell you which subdomains exist even when they are not listed.
- Query by **organization name** as well as by domain: a certificate issues names for hosts that never appear in DNS of the domain you started from.
- The names you get are historical: a name that no longer resolves may be an expired record, a decommissioned service, or a takeover candidate. Check which.

## Certificate and service pivoting

- Fingerprint the certificate (serial, SPKI/fingerprint hash, issuer plus subject) and search for the same fingerprint elsewhere: the same certificate on another IP means a shared host, a load balancer, or a staging clone of production.
- Read the SAN list actively as well: connect and read the certificate the host serves now. Names that CT never recorded show up here, and so do internal-looking names on public hosts.
- Pivot on the response fingerprint too: favicon hash, TLS JA3-like fingerprints, error page shape, default HTML title. The same application on a different host is a different, often less defended, target.

## ASN and netblock expansion

- Resolve the target to IPs, map each IP to its ASN and netblock, then enumerate the sibling hosts in that netblock that serve HTTP or an interesting port.
- The same organization usually announces several netblocks; find them by ASN, not only by DNS.
- Classify hosts by function, not by product: mail, VPN, CI, admin, staging, monitoring, object storage. The function tells you the value of the host; the product only tells you the software.

## Virtual hosts and shared infrastructure

- Compare responses from the same IP for different Host headers: a vhost that returns different content than the default is a second application.
- Look for the shared hosting pattern: one IP, many names, different TLS certificates, the same upstream.
- Internal-looking names (admin, jenkins, gitlab, grafana, kibana, registry, vpn, jump) answering publicly are the highest-value finding available from passive work.

## Third-party and lifecycle exposure

- Enumerate the services the target depends on: analytics, tag managers, CDNs, auth providers, support widgets, status pages, package registries. Each is a trust relationship.
- **Ownership drift is a finding class of its own.** A CNAME, MX, NS record or static-asset origin that points at a resource nobody controls any more is claimable by whoever registers it. Build the ladder before you claim anything: indicator (a record exists) → authoritative availability (the resource really is unregistered) → acquisition (it can be registered) → protocol identity (the name is accepted as the target's) → consumer acceptance (the target actually uses it). Stop a rung short and it is a lead, not a finding.
- A registry answering "not found" is not the same as "claimable": expired, reserved, suspended and premium names all answer differently.
- Cloud storage and bucket names follow the same ladder; the naming convention is usually the organization's own, so enumerate patterns rather than guessing one.

## Rules

- Passive means passive: no touch on the target from these techniques, and no third-party service that would notify the target's owner without their authorization.
- Every claim carries its source (a CT query, a certificate, an HTTP response, a DNS record). "Likely" is a word to use, not to hide.
- Record each asset with its evidence as you find it (`stm_write`): the name, the address, the certificate, the function, the technology, and the confidence.

## Output

The organization's surface as far as it is publicly visible: root and sibling domains, certificate names (live and historical), netblocks and the responsive hosts inside them, virtual hosts, third-party dependencies, and the ownership-drift leads with the ladder rung each reached. Then the hosts worth active enumeration, in priority order.
