---
name: lint
description: Workflow for running and fixing linting across all project modules
---

# Project-Wide Linting & Formatting

## When to Use

Use this when you need to run linting and formatting across the entire project, or when fixing lint errors in any service (`core-api`, `console`, `worker`).

## Process

### 1. Core-API

```bash
cd core-api && npm run lint
```

The `lint` script includes `--fix`. Fix any remaining errors manually.

**Checkpoint:** 0 errors.

### 2. Console

```bash
cd console && npm run lint -- --fix
```

Fix remaining errors manually.

**Checkpoint:** 0 errors.

### 3. Worker

```bash
cd worker && cargo fmt
cd worker && cargo clippy -- -D warnings
```

Fix Clippy warnings manually to adhere to Rust best practices.

**Checkpoint:** 0 warnings/errors.

### 4. Final Verification

```bash
task lint
```

All modules must pass linting without errors.

## Completion Summary

- **Core-API:** ✅ / ❌ (list fixed issues if any)
- **Console:** ✅ / ❌ (list fixed issues if any)
- **Worker:** ✅ / ❌ (list fixed issues if any)
- Status: **LINT-CLEAN**
