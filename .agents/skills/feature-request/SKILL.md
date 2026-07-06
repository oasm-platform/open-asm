---
name: feature-request
description: Workflow for creating and submitting feature requests to GitHub
---

# Feature Request

## When to Use

Use this when proposing a new feature or enhancement for the project. Covers requirement analysis, drafting, user confirmation, and GitHub submission. The final request must be in English.

## Process

### 1. Requirement Brainstorming

Before drafting, analyze:
- **Problem Statement:** What specific problem does this feature solve?
- **User Need:** Who benefits and why?
- **Proposed Solution:** High-level technical approach
- **Impact:** How does this align with project goals?

### 2. Draft the Request

Use `.github/ISSUE_TEMPLATE/feature-request.yml` with:
- **Title:** `Feature: ` followed by feature name
- **Feature Description:** Concise description of the enhancement
- **Problem or Need:** Gap in current functionality
- **Proposed Solution:** Detailed how it should work
- **Alternatives Considered:** Other ways the problem could be solved
- **Additional Context:** Links, screenshots, references

### 3. User Confirmation

Present the draft to the user and ask for confirmation before submitting.

### 4. Submit via GitHub CLI

```bash
gh issue create --title "[Feature]: New capability" --label "enhancement,feature" --body "$(cat <<'EOF'
## Feature Description
...
## Problem or Need
...
EOF
)"
```

### 5. Verify

Confirm the issue was created successfully. Ensure the proposal is technically feasible and clearly articulated.

## Standards
- Outcome-oriented: focus on user value
- Explain technical feasibility
- GitHub issue must be **strictly in English**
