---
description: 'A global workflow to reflect on a task and propose improvements to active .clinerules based on user feedback and multi‑step work.'
author: 'Cline Team'
version: '1.0'
tags: ['reflection', 'rules', 'workflow', 'process-improvement']
globs: ['*.*']
---

This is a manual workflow. Invoke with `/self-improving-cline.md`. The goal is to propose focused, high‑value improvements to your active .clinerules (global and/or workspace). No diff scaffolding here — handle mechanics as needed.

<detailed_sequence_of_steps>

# Self‑Improving Cline Reflection — Detailed Sequence of Steps

## 1) Applicability Check

Ask whether reflection is warranted for this task:

```xml
<ask_followup_question>
<question>Did this task involve user feedback at any point OR multiple non-trivial steps (e.g., several file edits, complex logic generation)?</question>
<options>["Yes — proceed", "No — end workflow"]</options>
</ask_followup_question>
```

If “No — end workflow”, conclude briefly and stop.

## 2) Offer Reflection

Confirm the user wants reflection and proposals:

```xml
<ask_followup_question>
<question>Before I proceed, would you like me to reflect on our interaction and suggest potential improvements to the active .clinerules?</question>
<options>["Yes — reflect", "No — end workflow"]</options>
</ask_followup_question>
```

If “No — end workflow”, conclude and stop.

## 3) Identify Active Rules (Best‑Effort)

- Workspace rules: `.clinerules/` (if present in the current project)
- Global rules: user’s global Rules directory (if accessible from this environment)

Attempt to list workspace rules:

```xml
<list_files>
<path>.clinerules</path>
</list_files>
```

Optionally list a known global rules path if visible:

```xml
<list_files>
<path>../Rules</path>
</list_files>
```

If some paths aren’t visible from this environment, ask the user to provide the files to consider (or confirm to skip).

## 4) Load Accessible Rule Files

For each accessible rule file you want to consider:

```xml
<read_file>
<path>path/to/rule/file.md</path>
</read_file>
```

## 5) Review and Synthesize Opportunities

Using the current task’s conversation context:

- Summarize relevant user feedback (explicit and implicit)
- Identify where rules helped or hindered flow
- Propose targeted improvements focused on:
  - Addressing user feedback directly
  - Improving clarity and conciseness
  - Consolidating overlapping guidance
  - Removing outdated or low‑impact sections

## 6) Present Proposals

Provide a concise list of suggested changes per file (no diff blocks). Keep focus on practical, high‑value edits.

## 7) Approval to Act

Ask how to proceed:

```xml
<ask_followup_question>
<question>Would you like me to apply these improvements now where possible, or just present recommendations?</question>
<options>["Apply now", "Show recommendations only", "Cancel"]</options>
</ask_followup_question>
```

## 8) Execute or Report

- If “Apply now”: implement updates for accessible files
- If “Show recommendations only”: present a clean summary for manual application
- If “Cancel”: make no changes

## 9) Conclude

Summarize what changed or what to change next, then finish.

</detailed_sequence_of_steps>

<notes>
- Manual workflow; not auto‑triggered. Run via `/self-improving-cline.md` when desired.
- Keep proposals short, specific, and actionable.
- No diff/replace scaffolding in the output; handle mechanics as needed.
</notes>
