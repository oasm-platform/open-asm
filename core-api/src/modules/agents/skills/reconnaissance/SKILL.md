---
name: reconnaissance
description: Methodology for authorized reconnaissance and attack-surface mapping of targets — subdomains, live hosts, ports, technologies and TLS — correlating results with OASM workspace data. Use when enumerating what a target exposes before deeper testing.
---

# Reconnaissance & attack-surface mapping

Use this skill to build an accurate map of what a target exposes, in the right order, before any exploitation. The goal of recon is coverage and correctness: find every live entry point, identify what runs on it, and feed the facts back for the next phase. This is `command-execution` for *how* to invoke a tool; this skill is *what* to run and in *what order*.

## When to use

- Starting a test and you need the target's hosts, subdomains, ports and technologies.
- An asset is known but you do not yet know its live surface.
- You need to confirm or expand what the workspace already knows about a target.

## Goal and todo first (Agent mode)

Before any command, `formulate_plan(steps)` and start the first step with `transition_step(id, "in_progress")` — tool calls are refused until a step is in progress. The goal is pinned above the plan (e.g. "Map the live web surface of example.com: subdomains, live hosts, ports, technologies"). Make the first step "List the ready tools with `display_available_tools`".

## Order of work

Recon is layered: each layer narrows the next. Do them in order and stop a layer once it stops yielding new surface.

1. **Known state.** `enumerate_assets`, `list_network_ports`, `fingerprint_technologies` to read what the workspace already found — do not re-discover what is already known.
2. **Passive first.** Prefer sources that never touch the target: workspace data, and `retrieve_web_page` for public records (certificate transparency, public DNS). Passive recon is free and silent; exhaust it before active scanning.
3. **Subdomain & DNS enumeration.** `subfinder` (built-in; it pipes through `dnsx` to resolve A/AAAA/CNAME/MX/NS) to expand the domain into live names. Keep only names that resolve into the target.
4. **Live-host probing.** `httpx` (built-in) over the resolved hosts for status code, title, web server, detected tech, TLS and CDN. This turns a list of names into a list of real HTTP services.
5. **Port & service discovery.** `naabu` (built-in) for open ports on the target hosts; a connector port scanner (e.g. `nmap`, if `display_available_tools` lists it ready) for service/version detail on the ports that matter. Keep scans small: specific ports, rate-limited.
6. **Technology & TLS detail.** `fingerprint_technologies` and `verify_tls_settings` to pin versions and TLS posture that later phases act on. `screenshot` (built-in) to eyeball interesting web apps quickly.

## Tool reality

- Built-in and reliably present: `subfinder`, `httpx`, `naabu`, `screenshot`. Run them with `execute_remote_command` by name (see `command-execution`).
- Everything else (`nmap`, `katana`, `gau`, `amass`, `nuclei`, …) may or may not be installed. Call `display_available_tools` and use only entries with `isReady`; never assume a binary exists, and if a needed one is missing, say which and move on.

## Safety

- Non-intrusive: rate-limit, cap threads, set timeouts; no brute force, no denial of service, no changes to the target.
- Save durable facts with `stm_write` so the next phase and other workers reuse them.

## Output

Report the live surface as structured facts, not raw dumps: hosts and subdomains, open ports with their services/versions, technologies with versions, TLS posture, and the few entry points most worth testing next (with the reason each stands out).
