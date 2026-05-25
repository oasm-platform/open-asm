---
name: command-execution
description: Execute security scanning commands on remote worker agents and perform external web research for CVE lookup and threat intelligence.
---

# Command Execution & Web Research

Use this skill when you need to run CLI security tools on remote workers or perform external web research for threat intelligence.

## Executing Commands on Workers

Use `execute_remote_command` to send CLI commands to worker agents for scanning and analysis.

### What to Run

- Subdomain discovery (`subfinder`, `amass`, etc.)
- HTTP probing (`httpx`, etc.)
- Port scanning (`naabu`, `nmap`, etc.)
- Vulnerability scanning (`nuclei`, etc.)
- Screenshot capture (`gowitness`, `aquatone`, etc.)
- DNS enumeration (`dnsx`, `dig`, etc.)
- Any CLI security tool available in the worker environment

### Command Format

Pass commands as you would in a terminal:

```
subfinder -d example.com -silent
httpx -l subdomains.txt -status-code -title -tech-detect
naabu -host example.com -top-ports 1000
nuclei -u https://example.com -severity critical,high
```

## External Research

### CVE Lookup

1. Fetch from: `https://raw.githubusercontent.com/trickest/cve/refs/heads/main/{YEAR}/CVE-{YEAR}-{NUMBER}.md`
2. Extract: description, affected versions, severity, remediation
3. If not found, suggest NVD as alternative

### Web Search

- Use `retrieve_web_page` for known URLs
- Use specific, targeted queries with year/version numbers
- For emerging threats, zero-days, or security concepts

### Deep Content Analysis

- After fetching a URL, analyze thoroughly
- Fetch linked references for comprehensive answers (max 3-5 recursive fetches)
- Synthesize multiple sources into actionable insights

## Tool Usage Rules

- Never expose internal tool names. Say "I found X assets" not "get_assets returned".
- Focus on results and insights, not the mechanism.
