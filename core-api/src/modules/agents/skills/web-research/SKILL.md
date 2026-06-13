---
name: web-research
description: Perform web research using CVE databases, security advisories, and threat intelligence sources. Use when the user asks about CVEs, security news, vulnerabilities, patch releases, or any external security information not available in the workspace.
---

# Web Research

Use this skill when you need to find external security information that is not already in the OASM platform.

## When to Use

- User asks about a specific CVE (e.g., "what is CVE-2024-1234?")
- User asks about recent vulnerabilities or exploits
- User wants to know about patch releases or security advisories
- User asks about industry-specific threats or news
- User needs context about a technology or software vulnerability

## Core Tool: `retrieve_web_page`

Use `retrieve_web_page` to fetch content from any public URL. It returns `statusCode` and `body`.

```
retrieve_web_page({ url: "https://example.com/path" })
```

Always use `retrieve_web_page` instead of trying to construct fetch requests manually. It handles User-Agent headers and error handling automatically.

## Workflow

### 1. Identify What You Need

Before fetching, know what information you're looking for:
- CVE details → fetch from Trickest/NVD
- Exploit PoC → fetch from GitHub/Exploit-DB
- Vendor patches → fetch from vendor advisory pages
- Threat news → fetch from security news sites

### 2. Build the URL

Pick the right source for the query:

| Query Type | Source | URL Pattern |
|---|---|---|
| CVE details | Trickest CVE | `https://raw.githubusercontent.com/trickest/cve/refs/heads/main/{YEAR}/CVE-{YEAR}-{NUMBER}.md` |
| CVE details (alt) | NVD API | `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-{YEAR}-{NUMBER}` |
| Microsoft CVE | MSRC | `https://msrc.microsoft.com/update-guide/vulnerability/CVE-{YEAR}-{NUMBER}` |
| Exploit code | GitHub | `https://github.com/search?q={QUERY}+exploit&type=repositories` |
| Exploit modules | Exploit-DB | `https://www.exploit-db.com/search?q={QUERY}` |
| Metasploit modules | Rapid7 | `https://www.rapid7.com/db/modules/?q={QUERY}` |
| Apache advisories | Apache Mailing Lists | `https://lists.apache.org/` |
| Package vulnerabilities | npm | `https://www.npmjs.com/advisories` |
| Package vulnerabilities | PyPI | `https://pypi.org/security/` |

### 3. Fetch and Analyze

1. Call `retrieve_web_page` with the constructed URL
2. Parse the `body` content — extract relevant sections
3. If the page has links to related content, fetch up to 3-5 linked pages for comprehensive analysis
4. Synthesize findings from multiple sources

### 4. Correlate with Workspace

After gathering external intel, map findings back to the workspace:

- Use `enumerate_assets` or `fingerprint_technologies` to check if affected software is in use
- Use `discover_vulnerabilities` to see if the CVE is already tracked
- Use `enumerate_open_issues` to check if someone is already investigating

### 5. Save Important Findings

- Use `stm_write` to store research results for the current conversation
- Use `ltm_append` to persist critical threat intelligence

## Query Tips

- Include version numbers: "Apache 2.4.49 path traversal" not just "Apache vulnerability"
- Include year for CVEs: "CVE-2024-1234" narrows results
- Use specific terms: "Log4Shell RCE" not "Log4j issue"
- For zero-days, search for the vendor advisory page directly
