---
name: web-research
description: Perform advanced web research using search engines, CVE databases, and vendor advisories. Use when the user asks about CVEs, security news, vulnerabilities, patch releases, or any external security information.
---

# Web Research

Use this skill when you need to find external security information that is not already in the OASM platform.

## When to use this skill

- User asks about a specific CVE (e.g., "what is CVE-2024-1234?")
- User asks about recent vulnerabilities or exploits
- User wants to know about patch releases or security advisories
- User asks about industry-specific threats or news
- User needs context about a technology or software vulnerability

## CVE Lookup

1. Fetch from: `https://raw.githubusercontent.com/trickest/cve/refs/heads/main/{YEAR}/CVE-{YEAR}-{NUMBER}.md`
2. If not found, try NVD: `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-{YEAR}-{NUMBER}`
3. Extract: description, affected versions, severity (CVSS), and remediation
4. Correlate with OASM assets — check if any assets run the affected software
5. If you found matching assets, recommend scanning priority

## Web Search

1. Use Brave Search: `https://search.brave.com/search?q={QUERY}&source=web`
2. Use DuckDuckGo as fallback: `https://lite.duckduckgo.com/lite/?q={QUERY}`
3. Use specific, targeted queries with year/version numbers
4. For emerging threats, zero-days, or security concepts — search broad and narrow down

## Vendor Advisory Lookup

- For Microsoft: `https://msrc.microsoft.com/update-guide/vulnerability/CVE-{YEAR}-{NUMBER}`
- For Apache: `https://lists.apache.org/thread/` search
- For Linux distributions: check their security tracker pages
- For npm/PyPI: check their security advisories database

## Deep Content Analysis

- After fetching a URL, analyze thoroughly
- Fetch linked references for comprehensive answers (max 3-5 recursive fetches)
- Synthesize multiple sources into actionable insights
- Always map findings back to OASM entities (assets, vulnerabilities, targets)
