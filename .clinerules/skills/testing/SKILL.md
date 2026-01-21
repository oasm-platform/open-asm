---
name: testing
description: Create and maintain comprehensive test coverage with 80%+ business logic coverage, following TDD principles and proper test organization. Use when adding or improving tests. Focus on test strategy, coverage targets, test organization, and quality gates.
---

# Testing Development

Testing in this project isn't just about preventing bugs - it's about building confidence in the codebase and documenting expected behavior. The 80% coverage target isn't an arbitrary number; it represents the sweet spot between comprehensive verification and practical development velocity.

## Understanding Test Strategy

The test analysis phase is crucial because it helps you identify gaps in your verification strategy. Coverage metrics are just one indicator - you also need to consider edge cases, error scenarios, and integration points that might not be adequately tested. The goal is to build a comprehensive safety net that catches issues before they reach users.

Different types of tests serve different purposes. Unit tests verify pure logic and individual components in isolation. Integration tests ensure that services, databases, and APIs work together as expected. E2E tests validate critical business flows from end to end. Understanding when to use each type is key to building an effective testing strategy.

## Test Implementation Philosophy

The emphasis on covering both happy paths and unhappy paths reflects the reality that error handling is just as important as mainline functionality. Users will inevitably trigger edge cases, and having tests for these scenarios helps ensure graceful degradation.

The AAA pattern (Arrange-Act-Assert) isn't just a convention - it makes tests more readable and maintainable. When tests follow this structure, other developers can quickly understand what's being tested and how to modify the test if requirements change.

## Test Organization and Structure

Colocating tests with source code makes them easier to find and maintain. When someone modifies a component, they can easily locate and update the associated tests. The clear `describe` blocks by feature help organize tests in a way that reflects the mental model of the system.

The mocking strategy deserves special attention. Mocking external dependencies ensures that tests are fast and reliable, but it also means you need integration tests to verify that the real components work together. Finding the right balance between mocked and real dependencies is an art that comes with experience.

## Quality and Maintenance

The zero-tolerance linting policy for tests isn't about being pedantic - it's about making tests readable and maintainable. Poorly formatted tests are harder to understand and modify, which leads to tests being ignored or deleted rather than updated.

The performance consideration is important because slow tests get run less frequently, which reduces their effectiveness. If tests take too long to run, developers will avoid running them, which defeats their purpose entirely.

## Documentation and Communication

The guidance about comments in tests is particularly important. Tests should be self-explanatory through good naming and clear structure. Comments should only be added when there's complex setup or business logic that isn't obvious from the test itself. This keeps tests clean while ensuring they remain understandable over time.

## Step-by-Step Workflow

### 1. Test Analysis & Planning

**Identify testing gaps:**
- Business logic coverage < 80%
- Missing edge cases / error scenarios
- Missing integration / E2E / performance tests

**Define test objectives & scope:**
- Unit tests (pure logic)
- Integration tests (services, DB, APIs)
- E2E tests (critical business flows)
- Performance tests (critical paths if applicable)

**Decide test strategy:**
- TDD for new logic
- Mock all external dependencies
- Use realistic, production-like test data

**Finalize tooling:**
- Jest (backend / frontend)
- React Testing Library (React)
- Supertest (API)
- Playwright (E2E if applicable)

### 2. Test Implementation (STRICT)

**Mandatory requirements:**
- Test all public functions / methods
- MUST have full documentation comments above every new or modified function
- Cover **happy paths and unhappy paths**
- Include edge cases and boundary conditions
- Follow **AAA pattern** (Arrange  Act  Assert)

**Test conventions:**
- Strict TypeScript typing
- Descriptive test names (behavior-focused)
- Correct naming: `*.spec.ts`, `*.test.tsx`
- Clear categorization: unit / integration / e2e

**Rules:**
- New business logic ’ **tests are required**
- All external dependencies must be mocked
- Test data must reflect real scenarios

**Coverage targets:**
- Business logic e 80%
- Critical paths e 90%

### 3. Test Structure & Organization

**Unit tests:**
- Pure logic, utilities, validation, error handling

**Integration tests:**
- Service-to-service interactions
- Database operations
- API and third-party integrations

**Organization rules:**
- Tests must be colocated with source code
- Use clear `describe` blocks by feature
- Use `beforeEach / afterEach` for setup and cleanup

**Mocking strategy:**
- External APIs and services
- Time and randomness
- In-memory databases

### 4. Linting & Code Quality (ZERO TOLERANCE)

**ESLint must report 0 errors and 0 warnings**

```bash
# Backend
cd core-api && npx eslint test/*.ts src/**/*.spec.ts

# Frontend
cd console && npx eslint src/**/*.test.tsx src/**/*.spec.ts
```

**Relax ESLint rules only when explicitly allowed for test files**

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
- Run tests multiple times ’ **no flakiness**
- Avoid slow tests that block CI

### 6. Documentation & Comments

**Use English comments only for complex or non-obvious setups**
**Document test data representing specific business scenarios**
**Do not comment obvious assertions or patterns**

### 7. Completion Summary (REQUIRED BEFORE DONE)

- Coverage improvement achieved (%)
- Test files created or updated
- Test categories added (unit / integration / e2e)
- Confirmation that coverage targets are met
- **Status: Ready for review**

## Common Commands

```bash
# Run all tests
cd core-api && npm run test
cd console && npm run test

# Run specific test file
npm run test -- <path-to-spec-file>

# Coverage
cd core-api && npm run test:cov
cd console && npm run test -- --coverage

# Run tests with coverage for specific file
npm run test -- --coverage <path-to-file>
```

## Resources

- Existing test suites: `core-api/test/*`, `console/src/**/*.test.*`
- ESLint configurations: `core-api/eslint.config.mjs`, `console/eslint.config.js`
- Project coding standards: `.clinerules/rules/oasm-coding-rules.md`