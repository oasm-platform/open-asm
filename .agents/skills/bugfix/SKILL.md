---
name: bugfix
description: Strict bug fix workflow from root cause analysis to deployment and regression testing
---

# Bug Fix Development

## When to Use

Use this when fixing any bug in the codebase. The process ensures root cause analysis before implementation, proper test coverage, and regression verification.

## Process

### 1. Bug Analysis & Root Cause Identification

- **Reproduce the bug** before implementing any fix
  - Create minimal reproduction case
  - Document exact steps to reproduce
  - Identify expected vs actual behavior
- **Find root cause:** trace through code flow to identify responsible component
- **Define scope:** what needs fixing, potential side effects, related affected areas
- **Document edge cases** that might trigger the bug

### 2. Implementation

- Create a **targeted fix** addressing only the root cause
- Follow existing code patterns and conventions
- Maintain backward compatibility where possible
- Strict TypeScript typing, proper error handling, clean code
- Full documentation comments on every new/modified function
- If security-related, address the vulnerability completely

### 3. Test-Driven Development

- Before implementing the fix, create a test that reproduces the bug (red-green-refactor)
- After the fix, verify the test passes and all existing tests still pass
- Cover: the specific bug scenario, related edge cases, regression scenarios, input validation
- Mock all external dependencies

### 4. Linting

```bash
# Backend
cd core-api && npx eslint src/path/to/modified/files.ts
# Frontend
cd console && npx eslint src/path/to/modified/files.tsx
```

Zero errors, zero warnings.

### 5. Regression Testing

```bash
# Backend
cd core-api && npm run test
# Frontend
cd console && npm run test
```

Also manually test affected functionality if applicable.

### 6. Documentation

English comments only for non-obvious logic or complex edge cases. No unnecessary comments.

### 7. Completion Summary

- Root cause of the bug
- Files modified
- Test cases added
- Regression tests pass
- Status: **Ready for review**
