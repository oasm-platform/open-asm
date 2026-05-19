---
name: ci-fix
description: CI/CD pipeline fix workflow from environment analysis to deployment
---

# CI/CD Fix Development

## When to Use

Use this when fixing CI/CD pipeline issues, Docker configurations, or deployment scripts. Works for GitHub Actions, Docker builds, and any pipeline-related problems.

## Process

### 1. Issue Analysis & Root Cause Identification

- **Reproduce the CI/CD issue** before fixing
  - Identify the specific failing stage
  - Document exact error messages and logs
  - Understand local vs CI environment differences
- **Find root cause:** environment differences (Node version, deps, OS), permissions, network, resource limits
- **Define scope:** affected pipeline stages and environments
- **Document differences** between local and CI (versions, caching, network policies)

### 2. Implementation

- Create a **targeted fix** addressing the identified CI/CD issue
- Follow existing CI/CD patterns and conventions
- Consider: Docker multi-stage builds, caching strategies, proper timeouts
- Fix root cause, not symptoms
- Ensure fix works in both local and CI environments
- No sensitive information exposed in pipeline logs or configs

### 3. Validation

- Before fix: identify validation steps (local Docker build, test execution, config validation)
- After fix: validate in local dev, Docker builds, and CI environment (feature branch)

### 4. Linting

```bash
# Dockerfile linting
docker run --rm -i hadolint/hadolint < Dockerfile
# YAML linting for GitHub Actions
yamllint .github/workflows/*.yml
# Shell script linting
shellcheck scripts/*.sh
```

Zero errors, zero warnings.

### 5. Pipeline Testing

```bash
# Test Docker builds locally
docker build -t test-image .
# Test scripts locally
bash scripts/build.sh
```

If possible, test in a feature branch to verify against actual CI environment.

### 6. Documentation

English comments only for complex CI/CD configurations or non-obvious workarounds.

### 7. Completion Summary

- Root cause of the CI/CD issue
- Configuration files modified
- Pipeline stages improved
- Validation completed
- Status: **Ready for review**
