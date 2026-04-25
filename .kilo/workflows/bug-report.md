---
description: 'Workflow for creating and submitting bug reports to GitHub'
---

## 🐛 Bug Report Workflow (AI-Enforced)

> Role: **QA Engineer / Bug Hunter (AI Agent)**
> Scope: Project-wide
> Rule: **The final bug report MUST be written in English.**
> Goal: Create a high-quality, reproducible bug report and submit it as a GitHub issue.

<detailed_sequence_of_steps>

## 1. Bug Analysis & Evidence Gathering (Checkpoint 1)

Before creating the report, you MUST gather the following information:

- **Exact Behavior**: What is happening vs. what should happen.
- **Reproduction Steps**: A clear, numbered list of steps to reproduce the bug.
- **Environment**: OS, versions (Node, Rust, etc.), and deployment method.
- **Logs**: Relevant snippets from `core-api`, `worker`, or browser console.
- **Affected Component**: Identify if it's in `core-api`, `console`, `worker`, or infra.

> ❌ You may NOT proceed to Step 2 until you have concrete evidence and reproduction steps.

## 2. Drafting the Report (Checkpoint 2)

Fill out the report based on `.github/ISSUE_TEMPLATE/bug-report.yml`. You MUST provide:

- **Title**: Start with `[Bug]: ` followed by a concise summary.
- **What happened?**: Detailed description of the issue.
- **Affected Component**: Choose from: `Console (Frontend UI)`, `Core API`, `Worker Service`, `Database/Storage`, `Authentication`, `Asset Management`, `Vulnerability Scanning`, `Job Management`, `Worker Management`, `MCP Server`, or `Other`.
- **Version**: Current version or commit hash.
- **Deployment Method**: `Docker Compose`, `Kubernetes`, `Development Mode`, `Production Build`, or `Other`.
- **Environment Details**: OS, Docker version, Node version, etc.
- **Log Output**: Formatted as code blocks.
- **Steps to Reproduce**: Clear 1, 2, 3... steps.
- **Security Impact**: How this affects security operations.

> ❌ The draft MUST be in English.

## 3. User Confirmation (Checkpoint 3)

Present the drafted report to the user and ask for confirmation before submitting.

- **Action**: Use `<ask_followup_question>` to confirm if the content is correct and ready for submission.
- **Modification**: If the user requests changes, return to Step 2.

> ❌ You may NOT proceed to Step 4 without explicit user approval.

## 4. GitHub Submission (Checkpoint 4)

Use the GitHub CLI (`gh`) to create the issue.

- **Command**: `gh issue create --title "..." --body "..."`
- Use a HEREDOC for the body to maintain formatting.
- Ensure all mandatory fields from the template are included.

## 5. Verification (Checkpoint 5)

- Verify the issue was created successfully by checking the returned URL.
- Ensure no sensitive data (secrets, keys) were included in the logs.

</detailed_sequence_of_steps>

<standards_and_conventions>

## Reporting Standards

- **Clarity**: Use technical language; avoid ambiguous terms like "it doesn't work".
- **Formatting**: Use Markdown for logs and reproduction steps.
- **Language**: **STRICTLY ENGLISH** for the GitHub issue.

</standards_and_conventions>

<common_commands>

## GitHub CLI Commands

```bash
# Create a bug report
gh issue create --title "[Bug]: Short description" --body "$(cat <<'EOF'
## What happened?
...
## Affected Component
...
EOF
)"
```

</common_commands>
