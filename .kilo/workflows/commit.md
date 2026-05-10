---
description: 'Workflow for committing code with comprehensive validation from linting to deployment'
---

## Git Commit & Push Workflow (AI-Enforced)

> Role: **Senior Software Engineer (AI Agent)**
> Scope: All services (`core-api`, `console`, `worker`)
> Rule: **You MUST execute EVERY step below sequentially. Skipping, merging, or reordering steps is NOT allowed.**
> Completion is valid **only if all checkpoints are satisfied**.

<detailed_sequence_of_steps>

# Commit & Push Process - Detailed Sequence of Steps

## 1. Pre-Commit Validation (Checkpoint 1)

### A. Code Quality Check

Before committing, ensure:
- All modified files follow project coding standards.
- No debug code, console.log statements, or TODO comments left behind.
- All sensitive data (API keys, credentials) are excluded via `.gitignore`.
- Code is self-documenting with clear naming conventions.

### B. Git Status Review

- Run `git status` to review all staged and unstaged changes.
- Verify only intentional changes are staged.
- Check for any untracked files that should be ignored.

### C. Change Summary

Explicitly document:
- List of modified files by service.
- Nature of changes (feature, fix, refactor, docs, chore).
- Breaking changes and impact assessment.
- Migration strategy if applicable.

> ❌ Do NOT proceed to Step 2 until all items in Step 1 are reviewed and compliant.

## 2. Core-API Validation (Checkpoint 2)

### Linting & Formatting

```bash
cd core-api && npm run lint
```

Requirements:
- **0 errors**, **0 warnings**.
- ESLint and Prettier pass automatically.
- TypeScript strict mode compliance.

### Testing

```bash
cd core-api && npm run test
```

Requirements:
- **100% tests pass**.
- Coverage **80%+** for business logic.
- Unit tests for all service methods.
- Integration tests for database operations.

> ❌ Do NOT proceed to Step 3 until core-api validation passes completely.

## 3. Console Validation (Checkpoint 3)

### Linting & Formatting

```bash
cd console && npm run lint
```

Requirements:
- **0 errors**, **0 warnings**.
- ESLint and Prettier pass automatically.
- React hooks rules compliance.
- No console.log statements.

### Type Checking

```bash
cd console && npm run typecheck
```

Requirements:
- **0 TypeScript errors**.
- Generated types in sync with API contracts.

> ❌ Do NOT proceed to Step 4 until console validation passes completely.

## 4. Worker Validation (Checkpoint 4)

### Linting & Formatting

```bash
task worker:format && task worker:lint
```

Requirements:
- `go fmt ./...` passes.
- `go vet ./...` reports **0 issues**.
- golangci-lint passes (if configured).

### Testing

```bash
cd worker && go test ./...
```

Requirements:
- **100% tests pass**.
- Coverage **80%+** for business logic.
- Table-driven tests for all exported functions.

> ❌ Do NOT proceed to Step 5 until worker validation passes completely.

## 5. API Contract Synchronization (Checkpoint 5)

### Console API Generation

If any API changes were made in core-api:

```bash
task console:gen-api
```

Verify:
- Generated types are compatible with frontend usage.
- No breaking changes in API contract.
- Worker client types are up to date.

> ❌ Do NOT proceed to Step 6 unless API contract is synchronized.

## 6. Commit Message Creation (Checkpoint 6)

### Convention Requirements

Follow **Conventional Commits** format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Allowed Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **style**: Formatting, no code change
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (deps, config, build, etc)

### Scope Guidelines

- `core-api`: Backend changes
- `console`: Frontend changes
- `worker`: Worker service changes
- `api`: API contract changes
- `db`: Database migrations
- `deps`: Dependency updates

### Message Examples

```
feat(core-api): add target service history endpoint

- GET /target-services/:id/history
- Returns array of TargetServiceHistoryDto
- Implements pagination for large datasets

Closes #123
```

```
fix(console): resolve dashboard loading state

- Add proper loading skeleton
- Handle empty state gracefully
- Improve error message display
```

```
chore(deps): update NestJS to v10

- Migrate from v9 to v10
- Update all deprecated decorators
- Run full test suite to verify compatibility
```

> ❌ Do NOT proceed to Step 7 until commit message follows convention exactly.

## 7. Commit Execution (Checkpoint 7)

### Stage Changes

```bash
git add <files>
```

Stage files according to commit type:
- API changes: Stage core-api module files
- Frontend changes: Stage console component files
- Worker changes: Stage worker internal files
- Config changes: Stage respective config files

### Create Commit

```bash
git commit -m "<message>"
```

Verify:
- Commit created successfully.
- No pre-commit hook failures.
- Commit hash generated.

### Git Status Check

```bash
git status
```

Confirm:
- Working tree is clean after commit.
- No uncommitted changes remain.

> ❌ Do NOT proceed to Step 8 unless commit is created successfully.

## 8. Push to Remote (Checkpoint 8)

### Push to Current Branch

```bash
git push origin <current-branch>
```

Verify:
- Push successful.
- No authentication failures.
- Remote branch updated.

### Confirm Upstream Tracking

If branch is new:

```bash
git push -u origin <current-branch>
```

> ❌ Do NOT proceed to Step 9 unless push is successful.

## 9. Completion Summary (Checkpoint 9)

Provide final summary including:

- **Modified Services**: List of services changed.
- **Modified Files**: Complete list of files.
- **Test Results**: Core-API ✅, Console ✅, Worker ✅.
- **Lint Results**: All services pass lint ✅.
- **Coverage**: Confirmation of 80%+ coverage ✅.
- **Commit**: Commit hash and message.
- **Push Status**: Remote branch updated ✅.
- **Status**: **READY FOR REVIEW**.

> ✅ ONLY after this step is completed is the commit workflow considered DONE.

</detailed_sequence_of_steps>

<standards_and_conventions>

# Commit & Code Quality Standards

## Pre-Commit Checklist

- [ ] No debug code or console.log statements
- [ ] No hardcoded secrets or credentials
- [ ] Code follows project style guides
- [ ] All tests pass locally
- [ ] Lint passes without errors

## Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

## Rules

- Subject: Max 50 characters, no period, imperative mood
- Body: Max 72 characters per line, explains what and why
- Footer: Reference issues with `Closes #` or `Fixes #`

## Push Requirements

- Always push to feature branches first (not directly to main)
- Ensure branch is up to date with base branch if required
- Verify remote tracking is set correctly

</standards_and_conventions>

<example_commit_workflow>

# Example: Committing a Bug Fix

## Step 1: Pre-Commit Validation

- Files modified: `core-api/modules/targets/target-services.service.ts`
- Nature: Bug fix
- No breaking changes

## Step 2-4: Validation

```bash
# Core-API
cd core-api && npm run lint && npm run test

# Console
cd console && npm run lint && npm run typecheck

# Worker
task worker:format && task worker:lint && go test ./...
```

All pass with 0 errors.

## Step 5: API Contract

No API contract changes - skip generation.

## Step 6: Commit Message

```
fix(core-api): resolve target service history pagination

- Fixed off-by-one error in pagination cursor
- Added proper edge case handling for empty results
- Enhanced query performance with proper indexing

Closes #456
```

## Step 7-8: Commit & Push

```bash
git add core-api/modules/targets/
git commit -m "fix(core-api): resolve target service history pagination"
git push origin feature/target-service-history
```

## Step 9: Completion

All validations passed. Push successful.

</example_commit_workflow>

<common_commands>

# Common Commit Commands

## Git Operations

```bash
# Check status
git status

# View changes
git diff --staged
git diff

# Stage all changes
git add -A

# Commit with message
git commit -m "type(scope): description"

# Push to remote
git push origin <branch>

# Push with upstream tracking
git push -u origin <branch>
```

## Validation Commands

```bash
# Core-API
cd core-api && npm run lint && npm run test

# Console
cd console && npm run lint && npm run typecheck

# Worker
task worker:format && task worker:lint && go test ./...

# API Generation
task console:gen-api
```

## Branch Operations

```bash
# Current branch
git branch --show-current

# List branches
git branch -a

# Switch branch
git checkout <branch>

# Create and switch
git checkout -b <new-branch>
```

</common_commands>

## Reference

- Taskfile: `Taskfile.yml` in project root
- Commit convention: Conventional Commits v1.0.0
- Linting: `.eslintrc.*`, `go.mod`, package.json configs
- Testing: Jest (core-api/console), go test (worker)
