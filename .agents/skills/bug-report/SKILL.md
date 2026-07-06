---
name: bug-report
description: Workflow for creating and submitting bug reports to GitHub
---

# Bug Report

## When to Use

Use this when you need to create a high-quality, reproducible bug report and submit it as a GitHub issue. The final report must be written in English.

## Process

### 1. Gather Evidence

Before drafting, collect:
- **Exact Behavior:** What's happening vs what should happen
- **Reproduction Steps:** Clear numbered list
- **Environment:** OS, versions (Node, Rust, etc.), deployment method
- **Logs:** Relevant snippets from `core-api`, `worker`, or browser console
- **Affected Component:** `core-api`, `console`, `worker`, or infra

### 2. Draft the Report

Use `.github/ISSUE_TEMPLATE/bug-report.yml` with:
- **Title:** `[Bug]: ` followed by concise summary
- **What happened?:** Detailed description
- **Affected Component:** Select from template options
- **Version:** Current version or commit hash
- **Deployment Method:** Docker Compose, Kubernetes, Dev, Production, etc.
- **Environment Details:** OS, Docker, Node versions
- **Log Output:** Formatted as code blocks
- **Steps to Reproduce:** Numbered steps

### 3. User Confirmation

Present the draft to the user and ask for confirmation before submitting.

### 4. Submit via GitHub CLI

```bash
gh issue create --title "[Bug]: Short description" --body "$(cat <<'EOF'
## What happened?
...
## Affected Component
...
EOF
)"
```

### 5. Verify

Confirm the issue was created successfully. Ensure no sensitive data (secrets, keys) were included in logs.

## Standards

- Use clear technical language, avoid ambiguous terms
- Use Markdown formatting for logs and reproduction steps
- GitHub issue must be **strictly in English**
