---
name: pr-review
description: Detailed PR review workflow from information gathering to analysis and approval/changes decision
---

# GitHub PR Review

## When to Use

Use this when reviewing a GitHub pull request. Covers information gathering, context understanding, change analysis, and the review/approval workflow.

## Process

### 1. Gather PR Information

```bash
# Get PR title, description, and comments
gh pr view <PR-number> --json title,body,comments

# Get the full diff
gh pr diff <PR-number>
```

### 2. Understand the Context

```bash
# List modified files
gh pr view <PR-number> --json files
```

Examine original files in the main branch to understand context around changes.

### 3. Analyze the Changes

For each modified file, understand what changed, why, how it affects the codebase, and potential side effects. Look for:
- Code quality issues
- Potential bugs
- Performance implications
- Security concerns
- Test coverage

### 4. User Confirmation

Before making a decision, present your assessment and ask the user whether to approve or request changes.

### 5. Draft a Comment (Optional)

Offer to draft a well-structured comment the user can copy and paste.

### 6. Make a Decision

```bash
# Approve
gh pr review <PR-number> --approve --body "Your message"

# Request changes
gh pr review <PR-number> --request-changes --body "Your feedback"

# Multi-line with proper formatting
cat << EOF | gh pr review <PR-number> --approve --body-file -
Your multi-line message
EOF

# Comment only (no approval/rejection)
gh pr review <PR-number> --comment --body "Your comment"
```

## Common Commands

```bash
# List open PRs
gh pr list

# View PR details
gh pr view <PR-number> --json title,body,comments,files,commits

# PR diff
gh pr diff <PR-number>

# Check out PR locally
gh pr checkout <PR-number>

# Check PR status/checks
gh pr checks <PR-number>
gh pr status

# Merge PR
gh pr merge <PR-number> --merge
```

## Review Guidelines

- Talk like a friendly reviewer. Keep it short. Thank the author (@mention them).
- Give a quick summary of your understanding, stay humble.
- Request changes if you have suggestions rather than approving with caveats.
- Leave inline comments only when you have something specific to say about the code.
