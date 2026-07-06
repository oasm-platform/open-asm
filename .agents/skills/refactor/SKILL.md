---
name: refactor
description: Safe code refactoring workflow focused on behavior preservation and strict testing
---

# Refactoring Development

## When to Use

Use this when improving internal code quality (readability, maintainability, structure, typing) without changing external behavior. Not for feature development or bug fixes — if logic must change, create a separate PR.

## Principles

1. **Strict Behavior Preservation:** Same input → same output. No changes to side-effects, error handling, timing, or public contracts.
2. **Tests Are the Source of Truth:** Existing tests define correct behavior. Do not modify or delete them.
3. **Clear Separation:** Refactoring ≠ feature development. Refactoring ≠ bug fixing.
4. **Incremental & Safe:** Small, controlled steps. Validate with tests after each step.

## Process

### 1. Analysis & Planning

**Define scope:** list files, functions, classes, modules being refactored.
**Identify code smells:** duplicated logic, large functions, unclear naming, tight coupling, weak typing.
**Impact analysis:** trace callers, dependencies, public APIs. Highlight high-risk areas (auth, money, state, async, concurrency).
**Strategy:** select 1–2 techniques per iteration (extract functions, rename, simplify control flow, improve boundaries, improve typing).

### 2. Baseline Verification (Mandatory)

**Test existence gate:** every service file being refactored must have a corresponding test file. If none exists, tests must be added first describing current behavior exactly. Refactoring is forbidden until these tests pass.

**Establish baseline:** run all related tests before modifying code. All must pass. If any fail, stop and handle separately.

### 3. Implementation

- Internal structural changes only
- Full documentation comments on every new/modified function
- Do NOT change: public APIs, function signatures, error messages, returned data shapes
- Allowed: add private helpers, add types/interfaces, split files without changing exports

**Per-step safety checklist:**
- Code compiles
- Relevant tests pass
- No snapshot or assertion changes

### 4. Testing

Run tests frequently during refactoring. After completion, run full test suite. Do not skip tests or update snapshots just to make tests pass.

### 5. Linting

```bash
# Backend
cd core-api && npx eslint src/path/to/modified/files.ts
# Frontend
cd console && npx eslint src/path/to/modified/files.tsx
```

Zero errors, zero warnings.

### 6. Integration & Safety

```bash
# Backend
cd core-api && npm run test
# Frontend
cd console && npm run test
```

Confirm no regressions and no performance degradation.

### 7. Documentation

Update English comments if structure changes. Do not add comments describing new behavior.

### 8. Completion Summary

- What was refactored and why
- List of modified files
- Confirmation of behavior preservation
- All tests passing
- Status: **Ready for Review**
