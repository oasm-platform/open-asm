---
description: "Strict testing workflow focused on 80%+ coverage, TDD, and unit/integration/E2E test types"
---

## 🧪 Testing Development Workflow (Strict & Optimized)

> Role: **Senior Test Engineer**
> Scope: **All test files in the project**
> Rule: **No step may be skipped**

---

### 1. Test Analysis & Planning (MANDATORY)

- Identify **testing gaps**:
  - Business logic coverage < 80%
  - Missing edge cases / error scenarios
  - Missing integration / E2E / performance tests

- Define **test objectives & scope**:
  - Unit tests (pure logic)
  - Integration tests (services, DB, APIs)
  - E2E tests (critical business flows)
  - Performance tests (critical paths if applicable)

- Decide **test strategy**:
  - TDD for new logic
  - Mock all external dependencies
  - Use realistic, production-like test data

- Finalize **tooling**:
  - Jest (backend / frontend)
  - React Testing Library (React)
  - Supertest (API)
  - Playwright (E2E if applicable)

---

### 2. Test Implementation (STRICT)

- **Mandatory requirements**:
  - Test all public functions / methods
  - MUST have full documentation comments above every new or modified function
  - Cover **happy paths and unhappy paths**
  - Include edge cases and boundary conditions
  - Follow **AAA pattern** (Arrange – Act – Assert)

- Test conventions:
  - Strict TypeScript typing
  - Descriptive test names (behavior-focused)
  - Correct naming: `*.spec.ts`, `*.test.tsx`
  - Clear categorization: unit / integration / e2e

- Rules:
  - New business logic → **tests are required**
  - All external dependencies must be mocked
  - Test data must reflect real scenarios

- Coverage targets:
  - Business logic ≥ 80%
  - Critical paths ≥ 90%

---

### 3. Test Structure & Organization

- Unit tests:
  - Pure logic, utilities, validation, error handling

- Integration tests:
  - Service-to-service interactions
  - Database operations
  - API and third-party integrations

- Organization rules:
  - Tests must be colocated with source code
  - Use clear `describe` blocks by feature
  - Use `beforeEach / afterEach` for setup and cleanup

- Mocking strategy:
  - External APIs and services
  - Time and randomness
  - In-memory databases

---

### 4. Linting & Code Quality (ZERO TOLERANCE)

- ESLint must report **0 errors and 0 warnings**

```bash
# Backend
cd core-api && npx eslint test/*.ts src/**/*.spec.ts

# Frontend
cd console && npx eslint src/**/*.test.tsx src/**/*.spec.ts
```

- Relax ESLint rules **only** when explicitly allowed for test files

---

### 5. Test Execution & Validation (MANDATORY)

```bash
# Run all tests
cd core-api && npm run test
cd console && npm run test

# Coverage
cd core-api && npm run test:cov
cd console && npm run test -- --coverage
```

- Verify coverage meets targets
- Run tests multiple times → **no flakiness**
- Avoid slow tests that block CI

---

### 6. Documentation & Comments

- Use **English comments only** for complex or non-obvious setups
- Document test data representing specific business scenarios
- Do not comment obvious assertions or patterns

---

### 7. Completion Summary (REQUIRED BEFORE DONE)

- Coverage improvement achieved (%)
- Test files created or updated
- Test categories added (unit / integration / e2e)
- Confirmation that coverage targets are met
- **Status: Ready for review**

---

> ❌ Missing any step → **work is NOT considered complete**