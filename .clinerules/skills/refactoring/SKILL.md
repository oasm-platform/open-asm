---
name: refactoring
description: Safely refactor code while preserving behavior, maintaining test coverage, and improving internal quality. Use when restructuring existing code without changing functionality. Focus on behavior preservation, incremental changes, test coverage, and code quality gates.
---

# Code Refactoring

Refactoring in this codebase is fundamentally about improving the internal quality of code while maintaining behavioral equivalence. The key insight is that refactoring isn't about adding features or fixing bugs - it's about making the code better for the next person who has to work with it.

## The Philosophy of Safe Refactoring

The non-negotiable principle of behavior preservation is what separates refactoring from feature development. When you refactor, you're essentially creating a better version of the same program. Users shouldn't notice any difference in functionality, but other developers should find the code easier to understand and modify.

The emphasis on tests as the source of truth reflects a mature testing culture. Your tests document the expected behavior, and refactoring is only successful when those tests continue to pass. This creates confidence that you haven't accidentally introduced bugs while improving the code structure.

## Strategic Refactoring Approach

The analysis phase is crucial because refactoring without understanding the impact can lead to unexpected consequences. Code smells are your guideposts - duplicated logic, overly complex functions, unclear naming - these indicate areas where the code is fighting against its intended purpose.

The impact analysis helps you understand the broader context. What calls this code? What does it depend on? Which areas are particularly sensitive? This knowledge guides how aggressive you can be with your changes.

## Incremental Safety

The incremental approach isn't just about safety - it's about maintainability. Small, focused changes are easier to review, test, and understand. Each step should leave the code in a working state, which means if something goes wrong, you can easily revert to a known good state.

The per-step safety checklist ensures that you're validating your changes frequently. This prevents the accumulation of multiple issues that can be difficult to untangle later.

## Testing as Your Safety Net

The test existence gate is particularly important for legacy code. If a piece of code doesn't have tests, you can't safely refactor it because you don't know what it's supposed to do. Adding tests first establishes the baseline behavior before you make any structural changes.

The rule about not modifying existing tests during refactoring is crucial. Tests should describe the behavior that should remain unchanged. If you find yourself wanting to change tests, you might actually be fixing a bug rather than refactoring.

## Quality Gates

The linting and code quality gates serve multiple purposes. They ensure consistency across the codebase, catch potential issues early, and maintain the standards that make the code readable. The zero-tolerance policy isn't bureaucratic - it's about maintaining quality as the codebase evolves.

## Documentation Considerations

The guidance about comments reflects the understanding that refactoring is about improving code structure, not changing logic. Comments should reflect the new structure, not describe behavioral changes (because there shouldn't be any). This keeps the documentation aligned with the code structure.

## Step-by-Step Workflow

### 0. Non-Negotiable Principles

1. **Strict Behavior Preservation**
   - Same input ’ **exact same output** as before refactoring
   - No changes to side-effects, error handling, timing, or public contracts

2. **Tests Are the Source of Truth**
   - Existing tests define the correct behavior
   - **Do not modify or delete existing tests**

3. **Clear Separation**
   - Refactoring ` Feature development
   - Refactoring ` Bug fixing
   - If logic must change ’ **stop and create a separate PR**

4. **Incremental & Safe Changes**
   - Small, controlled steps
   - Validate with tests after each step

### 1. Refactoring Analysis & Planning

**Define Refactoring Scope:**
- Explicitly list: Files, Functions / Classes / Modules
- Identify concrete **code smells**:
  - Duplicated logic
  - Large or multi-responsibility functions
  - Unclear naming
  - Tight coupling
  - Weak or unsafe typing

**Impact Analysis:**
- Trace all: Callers, Dependencies, Public APIs / exports
- Highlight: High-risk areas, Sensitive logic (auth, money, state, async, concurrency)

**Refactoring Strategy:**
Select **only 12 techniques per iteration**:
- Extract functions / classes
- Rename for clarity
- Simplify control flow (guard clauses, early returns)
- Improve module boundaries
- Improve TypeScript typing (no runtime behavior changes)

### 2. Baseline Verification (MANDATORY)

**Test Existence Gate (Hard Rule):**
- For **every service file being refactored**:
  - If **no corresponding test file exists** ’ **tests MUST be added first**
  - New tests must describe the **current (legacy) behavior** exactly
  - **Refactoring is forbidden** until:
    - The new tests pass 100%
    - Tests accurately lock in existing behavior

>   These tests exist to **freeze current behavior**, not to improve or change logic.

**Establish Baseline:**
Before modifying any production code:
1. Run **all related tests** (including newly added ones)
2. Verify: All tests **pass**
3. If any test fails ’ **stop refactoring and handle separately**

### 3. Refactoring Implementation

**Implementation Rules:**
- Only internal structural changes are allowed
- MUST have full documentation comments above every new or modified function
- Do **not** change:
  - Public APIs
  - Function signatures
  - Error messages
  - Returned data shapes

**Allowed actions:**
- Add private helpers
- Add types / interfaces
- Split files **without changing exports**

**Per-Step Safety Checklist:**
After **each small refactoring step**:
- [ ] Code compiles
- [ ] Relevant tests pass
- [ ] No snapshot or assertion changes

### 4. Refactoring-Driven Testing (Guard Rails)

**During Refactoring:**
- Run tests **frequently**
- Tests must immediately catch:
  - Accidental logic changes
  - Broken edge cases

**After Completion:**
- Run the **full test suite**
- Forbidden actions:
  - Skipping tests
  - Updating snapshots just to make tests pass

>   New tests may be added **only if**:
> - Existing behavior is not fully covered
> - New tests describe **existing behavior**, not new behavior

### 5. Linting & Code Quality Gate

**ESLint requirements:**
- **Zero errors**
- **Zero warnings**

```bash
# Backend
cd core-api && npx eslint src/path/to/modified/files.ts

# Frontend
cd console && npx eslint src/path/to/modified/files.tsx
```

**Use refactoring opportunities to:**
- Normalize formatting
- Remove dead code
- Align naming conventions

### 6. Integration & Safety Verification

**Run full test suites:**

```bash
# Backend
cd core-api && npm run test

# Frontend
cd console && npm run test
```

**Confirm:**
- No regressions
- No performance degradation (if code is performance-critical)

### 7. Documentation & Comments

**Update English comments** if structure changes
**Do not** add comments describing new behavior
**Comments must reflect structure only**, not logic changes

### 8. Completion Summary (MANDATORY)

Provide a concise report:
- **What was refactored and why**
- **List of modified files**
- **Confirmation of behavior preservation**
- **All tests passing**
- Status: **Ready for Review**

## Common Commands

```bash
# Run specific test file
npm run test -- <path-to-spec-file>

# Run ESLint on specific files
npx eslint <path-to-file>

# Run all tests
npm run test
```

## Resources

- Existing test suites: `core-api/test/*`, `console/src/**/*.test.*`
- ESLint configurations: `core-api/eslint.config.mjs`, `console/eslint.config.js`
- Project coding standards: `.clinerules/rules/oasm-coding-rules.md`