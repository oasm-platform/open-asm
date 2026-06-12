---
name: command-execution
description: Execute security scanning commands on remote worker agents. Use when you need to run CLI tools like nmap, subfinder, httpx, nuclei, or any shell command on worker nodes.
---

# Command Execution

Use this skill when you need to run CLI security tools on remote worker nodes via `execute_remote_command`.

## Workflow

### 1. Check Worker Availability

Before executing commands, verify workers are online:

```
Use list_active_workers to confirm at least one worker is available.
```

If no workers are available, inform the user and suggest they wait or check worker status.

### 2. Understand the Tool

`execute_remote_command` runs arbitrary shell commands on remote workers.

**Parameters:**
- `command` (string, required): The shell command to execute

**Output fields:**
- `stdout`: Standard output
- `stderr`: Standard error
- `exitCode`: Process exit code (0 = success)
- `error`: Error message if execution failed
- `timedOut`: Whether the command exceeded timeout

**Constraints:**
- No PTY (non-interactive)
- Strict timeout (60 seconds default)
- OS-level permissions apply
- Commands run in the worker's environment (tools must be installed)

### 3. Choose the Right Tool

Not everything needs remote execution. Use the right tool for the job:

| Task | Tool |
|---|---|
| Run CLI scanners (nmap, nuclei, subfinder, etc.) | `execute_remote_command` |
| List workspace assets, vulns, ports, technologies | Use `enumerate_assets`, `discover_vulnerabilities`, `list_network_ports`, `fingerprint_technologies` |
| Get details on a specific asset or vulnerability | Use `inspect_asset`, `investigate_vulnerability` |
| Fetch a web page | Use `retrieve_web_page` |

Only use `execute_remote_command` when you need to run a CLI tool that is not available through the built-in OASM tools.

### 4. Build the Command

Use standard CLI syntax. Examples by category:

**Subdomain Discovery:**
```
subfinder -d example.com -silent
amass enum -passive -d example.com
```

**HTTP Probing:**
```
httpx -l subdomains.txt -status-code -title -tech-detect
httpx -u https://example.com -follow-redirects -status-code
```

**Port Scanning:**
```
naabu -host example.com -top-ports 1000
nmap -sV -sC -oX output.xml example.com
nmap -p 80,443,8080,8443 example.com
```

**Vulnerability Scanning:**
```
nuclei -u https://example.com -severity critical,high
nuclei -l urls.txt -severity critical,high,medium
```

**DNS Enumeration:**
```
dig example.com ANY
dnsx -d example.com -silent
```

**Screenshot Capture:**
```
gowitness file -f urls.txt -P ./screenshots
```

**OSINT / Recon:**
```
theHarvester -d example.com -b all
```

### 5. Execute and Analyze

1. Run the command via `execute_remote_command`
2. Check `exitCode` — non-zero may indicate partial results (e.g., nmap found nothing)
3. Parse `stdout` for findings
4. Check `stderr` for warnings or errors
5. If the command times out, suggest breaking it into smaller scans or increasing scope

### 6. Save Results

After scanning, save important findings to memory:

- Use `stm_write` to store scan results (e.g., key: `"subdomain_results"`, value: the output)
- Use `ltm_append` to persist critical findings across conversations

## Safety Rules

- **Scope check**: Only run scans against targets within the workspace scope. Use `retrieve_targets` to verify scope before scanning.
- **Avoid destructive flags**: Do not use `--rm`, `rm -rf`, or similar commands that could damage the worker.
- **Prefer read-only scans**: Use `-sV` (version detection) over `-O` (OS detection) when possible — less intrusive.
- **Rate limiting**: Add delays between bulk operations (e.g., `--rate-limit` flags) to avoid overwhelming targets.
