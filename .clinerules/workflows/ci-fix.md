## 🔧 CI/CD Fix Development Workflow (AI IDE)

> Role: You are a **senior DevOps engineer** working on fixing CI/CD pipeline issues in this codebase.
> Requirement: Follow **exactly** the workflow below when implementing any CI/CD fixes or improvements.
> Applies to: CI/CD configuration files, Docker configurations, deployment scripts

---

### 1. CI/CD Issue Analysis & Root Cause Identification

- **Reproduce the CI/CD issue** before implementing any fix
  - Identify the specific stage where the pipeline fails
  - Document the exact error messages and logs
  - Understand the difference between local and CI environment

- Identify **root cause** of the CI/CD issue
  - Environment differences (Node.js version, dependencies, OS)
  - Permission issues in container builds
  - Network connectivity problems in CI environment
  - Resource limitations (memory, disk space, timeouts)

- Define **scope of the CI/CD fix**
  - Which pipeline stages are affected (build, test, deploy)
  - What environments are impacted (GitHub Actions, Docker, local)
  - Potential side effects on other pipeline stages

- Document **environment differences** between local and CI
  - Different Node.js/npm versions
  - Different operating systems
  - Different dependency caching mechanisms
  - Different network/security policies

---

### 2. Implementation (CI/CD Fix)

- **Mandatory**: Create a **targeted fix** that addresses only the identified CI/CD issue.
  - Fix the specific pipeline problem without changing unrelated functionality
  - Follow existing CI/CD patterns and conventions
  - Maintain backward compatibility with existing workflows

- The **CI/CD Fix must follow**:
  - Proper Dockerfile optimization and multi-stage builds
  - Efficient dependency caching strategies
  - Appropriate timeout configurations
  - Clean, readable pipeline configuration structure
  - Follow existing naming conventions for pipeline jobs/steps

- **CI/CD Fix Rules**:
  - **First Rule**: Never fix symptoms, always fix the root cause in the pipeline
  - **Second Rule**: Ensure the fix works in both local and CI environments
  - **Third Rule**: Optimize for build performance and reliability
  - **Fourth Rule**: Add proper error handling and logging for debugging
  - **Fifth Rule**: MUST have full documentation comments above every new or modified function

- **Testing Rule**: Test the fix in both local environment and actual CI pipeline if possible.
- **Security Rule**: Ensure no sensitive information is exposed in pipeline logs or configurations.

---

### 3. Test-Driven Development (CI/CD Validation)

- **Before implementing the fix**, identify what validation steps are needed:
  - Local Docker build verification
  - Local test execution verification
  - Pipeline configuration validation

- **After implementing the fix**, validate in multiple environments:
  - Local development environment
  - Local Docker container builds
  - CI environment (through actual pipeline run)

- Validation should cover:
  - Successful build completion → now fixed
  - Proper dependency installation and caching
  - Test execution without timeout issues
  - Docker image size optimization (if applicable)
  - Deployment success (if applicable)

- **Mock external dependencies** in CI tests where appropriate to ensure consistent builds.

---

### 4. Linting & Code Quality

- Ensure CI/CD configuration files pass any available linters with **zero errors and zero warnings**.
- Run linters on configuration files:

  ```bash
  # Dockerfile linting
  docker run --rm -i hadolint/hadolint < Dockerfile

  # YAML linting for GitHub Actions
  yamllint .github/workflows/*.yml

  # Shell script linting (if applicable)
  shellcheck scripts/*.sh
  ```

- Fix all lint issues before proceeding.
- **Zero tolerance rule**: No linting violations allowed in CI/CD configurations.

### 5. Pipeline Testing

- Run **local verification** of the CI/CD changes:

  ```bash
  # Test Docker builds locally
  docker build -t test-image .

  # Test scripts locally
  bash scripts/build.sh
  ```

- **Pipeline verification**: If possible, test in a feature branch to ensure the fix works in actual CI environment.
- **Performance verification**: Ensure the fix doesn't significantly increase build times or resource usage unnecessarily.

### 6. Documentation & Comments

- Add **English comments** to explain complex CI/CD configurations or non-obvious workarounds.
- Update any related documentation about deployment or build processes.
- **No unnecessary comments**: Don't add comments for obvious CI/CD steps or standard practices.

### 7. Completion Summary

Provide a short summary including:

- **Root cause of the CI/CD issue** that was fixed
- **Configuration files modified** with the fix
- **Pipeline stages improved** and performance metrics
- **Validation completed** - confirmation that CI/CD now works properly
- Status: **Ready for review**

---

## Resources

- Docker configurations: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- GitHub Actions: `.github/workflows/*`
- Task runners: `taskfile.yml`, `package.json` scripts
- Project CI/CD standards: `.clinerules/rules/oasm-coding-rules.md`
