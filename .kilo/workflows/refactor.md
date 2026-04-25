---
description: "Safe code refactoring workflow focused on behavior preservation, strict testing, and code quality improvement"
---

## ♻️ Refactoring Development Workflow (AI IDE – Optimized)

> **Role**: Senior Software Engineer performing code refactoring.
>
> **Core Goal**: Improve internal code quality (readability, maintainability, structure, typing, internal performance) **WITHOUT changing behavior**, **WITHOUT modifying existing tests**, and **ALL tests must pass after refactoring**.
>
> **Scope**: Applies to all directories in the project.

---

## 0. Non-Negotiable Principles

1. **Strict Behavior Preservation**
   - Same input → **exact same output** as before refactoring
   - No changes to side-effects, error handling, timing, or public contracts

2. **Tests Are the Source of Truth**
   - Existing tests define the correct behavior
   - **Do not modify or delete existing tests**

3. **Clear Separation**
   - Refactoring ≠ Feature development
   - Refactoring ≠ Bug fixing
   - If logic must change → **stop and create a separate PR**

4. **Incremental & Safe Changes**
   - Small, controlled steps
   - Validate with tests after each step

---

## 1. Refactoring Analysis & Planning

### 1.1 Define Refactoring Scope

- Explicitly list:
  - Files
  - Functions / Classes / Modules

- Identify concrete **code smells**:
  - Duplicated logic
  - Large or multi-responsibility functions
  - Unclear naming
  - Tight coupling
  - Weak or unsafe typing

### 1.2 Impact Analysis

- Trace all:
  - Callers
  - Dependencies
  - Public APIs / exports

- Highlight:
  - High-risk areas
  - Sensitive logic (auth, money, state, async, concurrency)

### 1.3 Refactoring Strategy

Select **only 1–2 techniques per iteration**:

- Extract functions / classes
- Rename for clarity
- Simplify control flow (guard clauses, early returns)
- Improve module boundaries
- Improve TypeScript typing (no runtime behavior changes)

---

## 2. Baseline Verification (MANDATORY)

### 2.1 Test Existence Gate (Hard Rule)

- For **every service file being refactored**:
  - If **no corresponding test file exists** → **tests MUST be added first**
  - New tests must describe the **current (legacy) behavior** exactly
  - **Refactoring is forbidden** until:
    - The new tests pass 100%
    - Tests accurately lock in existing behavior

> ⚠️ These tests exist to **freeze current behavior**, not to improve or change logic.

### 2.2 Establish Baseline

Before modifying any production code:

1. Run **all related tests** (including newly added ones)
2. Verify:
   - All tests **pass**
   - If any test fails → **stop refactoring and handle separately**

---

## 3. Refactoring Implementation

### 3.1 Implementation Rules

- Only internal structural changes are allowed
- MUST have full documentation comments above every new or modified function
- Do **not** change:
  - Public APIs
  - Function signatures
  - Error messages
  - Returned data shapes

- Allowed actions:
  - Add private helpers
  - Add types / interfaces
  - Split files **without changing exports**

### 3.2 Per-Step Safety Checklist

After **each small refactoring step**:

- [ ] Code compiles
- [ ] Relevant tests pass
- [ ] No snapshot or assertion changes

---

## 4. Refactoring-Driven Testing (Guard Rails)

### During Refactoring

- Run tests **frequently**
- Tests must immediately catch:
  - Accidental logic changes
  - Broken edge cases

### After Completion

- Run the **full test suite**
- Forbidden actions:
  - Skipping tests
  - Updating snapshots just to make tests pass

> ⚠️ New tests may be added **only if**:
>
> - Existing behavior is not fully covered
> - New tests describe **existing behavior**, not new behavior

---

## 5. Linting & Code Quality Gate

- ESLint requirements:
  - **Zero errors**
  - **Zero warnings**

```bash
# Backend
cd core-api && npx eslint src/path/to/modified/files.ts

# Frontend
cd console && npx eslint src/path/to/modified/files.tsx
```

- Use refactoring opportunities to:
  - Normalize formatting
  - Remove dead code
  - Align naming conventions

---

## 6. Integration & Safety Verification

- Run full test suites:

```bash
# Backend
cd core-api && npm run test

# Frontend
cd console && npm run test
```

- Confirm:
  - No regressions
  - No performance degradation (if code is performance-critical)

---

## 7. Documentation & Comments

- Update **English comments** if structure changes
- Do **not** add comments describing new behavior
- Comments must reflect **structure only**, not logic changes

---

## 8. Completion Summary (MANDATORY)

Provide a concise report:

- **What was refactored and why**
- **List of modified files**
- **Confirmation of behavior preservation**
- **All tests passing**
- Status: **Ready for Review**

---

### AI IDE Enforcement Keywords

> "Behavior-preserving refactor only. Tests define truth. No logic changes. Small, safe, incremental steps."