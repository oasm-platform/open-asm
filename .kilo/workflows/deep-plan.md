---
description: 'Deep planning workflow for AI'
---

## Goal

Produce an executable deep plan for a new request with:

- clear problem framing
- mandatory external research (Websearch / Codesearch / Webfetch)
- actionable Todoread / Todowrite

## Flow

1. Parse & normalize request
2. Intent & scope analysis
3. External research (required)
4. Build context
5. Decompose tasks
6. Generate todos
7. Assemble markdown plan

## Steps

### 1) Parse & Normalize

- Extract goal, constraints, expected output
- Remove ambiguity

### 2) Intent & Scope

- Identify domain, complexity, dependencies
- Classify: research-heavy vs implementation-heavy

### 3) External Research (REQUIRED)

- Websearch: official docs, best practices
- Codesearch: relevant repos, examples
- Webfetch: pull key pages
- Output: sources + distilled insights

### 4) Context Building

- Synthesize findings
- Draft architecture/options

### 5) Task Decomposition

- Split into milestones and small, testable tasks
- Each task has clear input/output

### 6) Todo Generation

**Todoread**

- Read code/docs/config

**Todowrite**

- Implement code/config/tests

### 7) Plan Assembly (.md)

## Template

```md
# Plan: <plan-name>

## Objective

<goal>

## Research

### Sources

- <url>
- <url>

### Insights

- <insight>

## Architecture

<overview>

## Tasks

### Milestone 1: <name>

- Task 1.1
- Task 1.2

### Milestone 2: <name>

- Task 2.1

## Todoread

- [ ] Read <file/module>
- [ ] Inspect <component>

## Todowrite

- [ ] Implement <feature>
- [ ] Add <config>

## Dependencies

- <lib/tool>

## Risks

- <risk>

## Execution Order

1. Step 1
2. Step 2
```

## Heuristics

- Always research before planning
- Prefer official sources
- If info is missing, research again

## Iteration

- Draft → check gaps → research → update → finalize

## Naming

```
.kilo/plans/
  <plan-name>.md
```

## Done Criteria

- Includes Todoread and Todowrite
- Contains external sources
- Clear task breakdown and execution order

## Output

```
.kilo/plans/<plan-name>.md
```
