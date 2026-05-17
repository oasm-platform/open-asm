---
name: deep-plan
description: Deep planning workflow for producing executable plans with research and task decomposition
---

# Deep Planning

## When to Use

Use this when you need to produce a thorough, executable plan before starting implementation. Best for complex features, multi-step tasks, or any work requiring upfront research and clear task breakdown.

## Process

### 1. Parse & Normalize
Extract goal, constraints, and expected output. Remove ambiguity from the request.

### 2. Intent & Scope Analysis
Identify domain, complexity, and dependencies. Classify as research-heavy or implementation-heavy.

### 3. External Research (Required)
- Websearch: official docs, best practices
- Codesearch: relevant repos, examples
- Webfetch: pull key pages
- Output: sources + distilled insights

### 4. Context Building
Synthesize findings. Draft architecture or options.

### 5. Task Decomposition
Split into milestones and small, testable tasks. Each task has clear input/output.

### 6. Generate Todos
- **Todoread:** read code/docs/config that needs understanding
- **Todowrite:** implement code/config/tests

### 7. Assemble Plan

Use this template:

```md
# Plan: <plan-name>

## Objective
<goal>

## Research
### Sources
- <url>

### Insights
- <insight>

## Architecture
<overview>

## Tasks
### Milestone 1: <name>
- Task 1.1

## Todoread
- [ ] Read <file/module>

## Todowrite
- [ ] Implement <feature>

## Dependencies
- <lib/tool>

## Risks
- <risk>

## Execution Order
1. Step 1
```

Save to `.kilo/plans/<plan-name>.md`.

## Heuristics
- Always research before planning
- Prefer official sources
- If info is missing, research again
- Draft → check gaps → research → update → finalize

## Done Criteria
- Includes Todoread and Todowrite items
- Contains external sources
- Clear task breakdown and execution order
