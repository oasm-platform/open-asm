---
name: commit
description: Workflow for committing code with comprehensive validation from linting to deployment
---

# Git Commit & Push

## When to Use

Use this when committing and pushing code changes across any service (`core-api`, `console`, `worker`). Runs validation checks before committing to ensure code quality.

## Process

### 1. Pre-Commit Validation

- All modified files follow project coding standards
- No debug code, console.log, or TODO comments left behind
- No sensitive data (API keys, credentials) — verify via `.gitignore`
- Run `git status` to review staged and unstaged changes
- Document: modified files by service, nature of changes (feature/fix/refactor), breaking changes

### 2. Core-API Validation

```bash
cd core-api && npm run lint
cd core-api && npm run test
```

Requirements: 0 errors, 0 warnings, 100% tests pass, 80%+ coverage.

### 3. Console Validation

```bash
cd console && npm run lint
cd console && npm run typecheck
```

Requirements: 0 errors, 0 warnings.

### 4. Worker Validation

```bash
task worker:format && task worker:lint
cd worker && go test ./...
```

Requirements: `go fmt` passes, `go vet` 0 issues, 100% tests pass.

### 5. API Contract Sync

If API changes were made in core-api:

```bash
task console:gen-api
```

### 6. Commit Message

Follow Conventional Commits: `type(scope): description`

- **Types:** feat, fix, docs, style, refactor, perf, test, chore
- **Scopes:** core-api, console, worker, api, db, deps
- Subject: max 50 chars, no period, imperative mood
- Body: max 72 chars per line, explains what and why
- Footer: reference issues with `Closes #` or `Fixes #`

Examples:
```
feat(core-api): add target service history endpoint
fix(console): resolve dashboard loading state
chore(deps): update NestJS to v10
```

### 7. Commit & Push

```bash
git add <files>
git commit -m "<message>"
git push origin <current-branch>
```

For new branches: `git push -u origin <current-branch>`

### 8. Completion Summary

- Modified services and files
- Test results: Core-API ✅ Console ✅ Worker ✅
- Lint results: all pass ✅
- Commit hash and message
- Status: **READY FOR REVIEW**
