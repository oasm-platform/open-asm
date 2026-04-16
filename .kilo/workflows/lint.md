---
description: 'Workflow for running and fixing linting across all project modules'
---

## 🧹 Project-Wide Linting & Formatting Workflow

> Role: **Senior Software Engineer (AI Agent)**
> Scope: `/core-api`, `/console`, `/worker`
> Rule: **Execute every step sequentially. Fix any errors found during the process.**

<detailed_sequence_of_steps>

# Linting Process - Detailed Sequence of Steps

## 1. Core-API Linting (Checkpoint 1)
- Run `cd core-api && npm run lint`.
- The `lint` script already includes `--fix`.
- If errors remain that cannot be auto-fixed, analyze and fix them manually.
- **Checkpoint**: `npm run lint` must return 0 errors.

## 2. Console Linting (Checkpoint 2)
- Run `cd console && npm run lint -- --fix`.
- If errors remain that cannot be auto-fixed, analyze and fix them manually.
- **Checkpoint**: `npm run lint` must return 0 errors.

## 3. Worker Formatting & Linting (Checkpoint 3)
- **Formatting**: Run `cd worker && cargo fmt`.
- **Linting**: Run `cd worker && cargo clippy -- -D warnings`.
- If Clippy warnings persist, analyze and fix them manually to adhere to Rust best practices.
- **Checkpoint**: `cargo clippy` must return 0 warnings/errors.

## 4. Final Verification (Checkpoint 4)
- Run `task lint` (or individual lint commands) to ensure everything is clean across the monorepo.
- **Checkpoint**: All modules must pass linting without errors.

</detailed_sequence_of_steps>

<common_lint_commands>

# Linting Commands Reference

## Core-API
```bash
cd core-api && npm run lint
```

## Console
```bash
cd console && npm run lint -- --fix
```

## Worker
```bash
cd worker && cargo fmt
cd worker && cargo clippy -- -D warnings
```

</common_lint_commands>

## Completion Summary
Provide a summary of the linting results:
- **Core-API**: ✅ / ❌ (List fixed issues if any)
- **Console**: ✅ / ❌ (List fixed issues if any)
- **Worker**: ✅ / ❌ (List fixed issues if any)
- Status: **LINT-CLEAN**
