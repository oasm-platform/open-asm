---
description: 'Workflow for creating and submitting feature requests to GitHub'
---

## ✨ Feature Request Workflow (AI-Enforced)

> Role: **Product Manager / Architect (AI Agent)**
> Scope: Project-wide
> Rule: **The final feature request MUST be written in English.**
> Goal: Propose a new feature or enhancement and submit it as a GitHub issue.

<detailed_sequence_of_steps>

## 1. Requirement Brainstorming (Checkpoint 1)

Before drafting, you MUST analyze the need:

- **Problem Statement**: What specific problem does this feature solve?
- **User Need**: Who benefits from this and why?
- **Proposed Solution**: High-level technical approach.
- **Impact**: How does this align with the Open-ASM goals?

> ❌ You may NOT proceed to Step 2 without a clear problem statement and proposed solution.

## 2. Drafting the Request (Checkpoint 2)

Fill out the request based on `.github/ISSUE_TEMPLATE/feature-request.yml`. You MUST provide:

- **Title**: Start with `Feature: ` followed by the feature name.
- **Feature Description**: Concise description of the enhancement.
- **Problem or Need**: Explanation of the gap in current functionality.
- **Proposed Solution**: Detailed description of how the feature should work.
- **Alternatives Considered**: Other ways the problem could be solved.
- **Additional Context**: Links, screenshots, or references.

> ❌ The draft MUST be in English.

## 3. User Confirmation (Checkpoint 3)

Present the drafted feature request to the user and ask for confirmation before submitting.

- **Action**: Use `<ask_followup_question>` to confirm if the proposal is correct and ready for submission.
- **Modification**: If the user requests changes, return to Step 2.

> ❌ You may NOT proceed to Step 4 without explicit user approval.

## 4. GitHub Submission (Checkpoint 4)

Use the GitHub CLI (`gh`) to create the issue.

- **Command**: `gh issue create --title "..." --body "..."`
- Use a HEREDOC for the body to maintain formatting.
- Apply labels: `enhancement`, `feature`.

## 5. Verification (Checkpoint 5)

- Verify the issue was created successfully by checking the returned URL.
- Ensure the proposal is technically feasible and clearly articulated.

</detailed_sequence_of_steps>

<standards_and_conventions>

## Proposal Standards

- **Outcome-Oriented**: Focus on the value provided to the user.
- **Technical Feasibility**: Briefly explain why the proposed solution is viable.
- **Language**: **STRICTLY ENGLISH** for the GitHub issue.

</standards_and_conventions>

<common_commands>

## GitHub CLI Commands

```bash
# Create a feature request
gh issue create --title "[Feature]: New capability" --label "enhancement,feature" --body "$(cat <<'EOF'
## Feature Description
...
## Problem or Need
...
EOF
)"
```

</common_commands>
