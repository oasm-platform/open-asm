---
name: reconnaissance
description: Attack-surface mapping methodology — passive discovery, subdomain and DNS enumeration, live-host probing, ports, services, technologies, TLS, content discovery, parameter mining and JS analysis, correlating everything with OASM workspace data. Load before testing anything so you test a mapped surface, not a guess.
---

# Reconnaissance & attack-surface mapping

Recon is the phase that decides how much of the target you will ever be able to reach. Coverage and correctness beat speed: find every live entry point, identify what runs on it, and write the facts down where later steps can use them.

## Order of work

Layer by layer; each layer narrows the next. Stop a layer only when it stops yielding new surface.

1. **Known state.** `enumerate_assets`, `list_network_ports`, `fingerprint_technologies`, `verify_tls_settings`. Never re-discover what the workspace already recorded — extend it.
2. **Passive first.** Sources that never touch the target: certificate transparency, public DNS, ASN and netblock, public code and paste and docs, archived pages, `retrieve_web_page` on public data. Passive recon is free, silent, and routinely finds the host nobody listed.
3. **Subdomains and DNS.** A subdomain enumerator piped through a resolver for A/AAAA/CNAME/MX/NS/TXT. Then pivot on what you get: a CNAME to a cloud service is a takeover candidate, a TXT record is a vendor and sometimes a key, an MX is a second target.
4. **Live-host probing.** Probe the resolved names for status code, title, web server, detected tech, TLS and CDN. A name that resolves but serves nothing is still useful: compare the vhost response against the default.
5. **Ports and services.** Port scan the hosts that matter, then service/version scan the open ports. Keep it narrow: named ports or a small range, rate-limited, bounded in time.
6. **Web content discovery.** On every live web service: crawl what links to what, then discover paths that nothing links to (directory and file discovery against the mapped roots). Read `robots.txt`, `sitemap.xml`, `.well-known/`, API docs (`/swagger`, `/openapi.json`, `/graphql`, `/api-docs`), backup and VCS paths (`.git/`, `.env`, `*.bak`, `*.zip`), admin and debug paths, and error pages.
7. **JavaScript and parameter mining.** Every JS bundle is a specification of the API: endpoints, parameters, headers, feature flags, internal hostnames, API keys and roles are all in there. Fetch the bundles, pull paths and keys out, then probe the endpoints you found. Then run a hidden-parameter pass on the endpoints and forms that take input.
8. **Technology and version proof.** For every product, the exact version and the line of evidence (header, body, favicon hash, TLS cert, banner, error string). A wrong version poisons every CVE lookup built on it.
9. **Converge and stop.** When a layer adds no new host, port, path or parameter, you are done mapping. Now testing starts.

## What counts as an entry point

Anything the app accepts or exposes: URL parameters and path segments, JSON and XML body keys, multipart fields, headers (Host, X-Forwarded-*, Origin, Referer, User-Agent, custom auth headers), cookies, upload filename and content type, sort/filter/page/format parameters, ids, tenant ids, role and plan fields, API version in the path, websockets, GraphQL operations, OAuth and SAML callbacks, and every host that answers differently from the default vhost.

Classify each by the sink it feeds, because that is what a tester does next: object id → object authorization; URL parameter → SSRF and open redirect; template input → SSTI; search/filter/sort → injection; XML → XXE; file path or name → traversal and upload; price/quantity/state → business logic; token/claim → auth.

## Practical notes

- Beyond the always-present basics, tool availability varies per worker: list them first (`display_available_tools`) and use what is `isReady`.
- Enumerate passive sources with `retrieve_web_page` when no dedicated tool exists — public certificate-transparency JSON and public DNS APIs are plain URLs.
- Keep every command bounded: one target, rate limits, explicit timeouts, about 60 seconds each. Several narrow commands beat one wide sweep that times out.
- Read long output with `read_tool_output` and a `pattern`; extract the facts and discard the dump.
- Check a mapped path in more than one way before calling it closed: method, host header, trailing slash, case, extension and encoding all change what a server returns.

## Safety

Non-intrusive by default: no brute force against authentication, no denial of service, no writes. Save every fact with `stm_write` as you find it — a fact that was never written is a fact the next step does not have.

## Output

Structured facts, not raw dumps: hosts and subdomains with resolution, open ports with service and version, live web endpoints with status/title/server/tech, technologies with versions and evidence, TLS posture, certificates and the names in them, discovered paths and parameters grouped by the class they feed, and the handful of entry points most worth testing next with the reason for each.
