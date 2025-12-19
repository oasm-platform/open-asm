## 🧪 Testing Development Workflow (AI IDE)

> Role: You are a **senior test engineer** working on improving test coverage and quality in this codebase.
> Requirement: Follow **exactly** the workflow below when implementing any testing improvements or new test suites.
> Applies to: All test files in the project

---

### 1. Test Analysis & Planning

- **Identify testing gaps** and coverage needs
  - Areas with insufficient test coverage (<80% for business logic)
  - Untested edge cases and error scenarios
  - Integration points that lack testing
  - Performance and load testing requirements

- Define **test objectives** and scope
  - Unit tests for individual functions/methods
  - Integration tests for service interactions
  - End-to-end tests for critical user flows
  - Performance tests for critical operations

- Plan **test strategy** approach
  - Test-driven development (TDD) for new features
  - Behavior-driven development (BDD) patterns
  - Mocking strategies for external dependencies
  - Test data management and fixtures

- Identify **testing tools and frameworks** to be used
  - Jest for JavaScript/TypeScript (backend/frontend)
  - React Testing Library for React components
  - Supertest for API testing
  - Playwright for E2E testing (if applicable)

---

### 2. Implementation (Test Development)

- **Mandatory**: Create **comprehensive test coverage** that follows testing best practices.
  - Test all public methods and functions
  - Cover edge cases and boundary conditions
  - Include error handling and exception scenarios
  - Follow AAA pattern (Arrange, Act, Assert)

- The **Tests must follow**:
- Strict TypeScript typing for test files
- Descriptive test names that explain the behavior being tested
- Clean, readable test structure and organization
- Follow existing naming conventions (`*.spec.ts` for backend, `*.test.tsx` for frontend)
- Use appropriate test categories (unit, integration, e2e)

- **Testing Rules**:
  - **First Rule**: All new business logic must have corresponding tests (80%+ coverage)
  - **Second Rule**: Test both happy path and unhappy path scenarios
  - **Third Rule**: Use realistic test data that represents production scenarios
  - **Fourth Rule**: Mock external dependencies to isolate the code under test

- **Coverage Rule**: Aim for 80%+ coverage for business logic, 90%+ for critical paths.
- **Quality Rule**: Focus on test quality over quantity - well-written tests are better than numerous poorly-written tests.

---

### 3. Test Structure & Organization

- **Unit Tests** should cover:
  - Individual functions and methods
  - Pure business logic functions
  - Utility functions and helpers
  - Input validation and error handling

- **Integration Tests** should cover:
  - Service interactions and dependencies
  - Database operations and queries
  - API endpoint integrations
  - Third-party service integrations

- **Test file organization**:
  - Place tests adjacent to the code being tested
  - Use descriptive file names (`feature.service.spec.ts`, `component.test.tsx`)
  - Group related tests using `describe` blocks
  - Use `beforeEach`/`afterEach` for test setup/cleanup

- **Mocking Strategy**:
  - Mock external APIs and services
  - Use in-memory databases for testing
  - Mock date/time for predictable tests
  - Mock random number generators for consistent results

---

### 4. Linting & Code Quality

- Ensure test code passes ESLint with **zero errors and zero warnings**.
- Run ESLint on the test files (relaxed rules may apply for test-specific patterns):

  ```bash
  # For backend tests
  cd core-api && npx eslint test/*.ts src/**/*.spec.ts

  # For frontend tests
  cd console && npx eslint src/**/*.test.tsx src/**/*.spec.ts
  ```

- Fix all lint issues before proceeding.
- **Test-specific rule**: Some ESLint rules may be relaxed for test files (like unused variables for mock objects).

### 5. Test Execution & Validation

- Run **all tests** to ensure they pass consistently:

  ```bash
  # Backend tests
  cd core-api && npm run test

  # Frontend tests
  cd console && npm run test
  ```

- **Coverage verification**: Check test coverage reports to ensure targets are met:

  ```bash
  # Generate coverage report
  cd core-api && npm run test:cov
  cd console && npm run test -- --coverage
  ```

- **Flakiness check**: Run tests multiple times to ensure they're deterministic and not flaky.
- **Performance check**: Ensure tests run efficiently (avoid slow tests that block development).

### 6. Documentation & Comments

- Add **English comments** only for complex test scenarios or non-obvious test setups.
- Document test data and fixtures when they represent specific business scenarios.
- **No redundant comments**: Don't comment obvious test assertions or common patterns.

### 7. Completion Summary

Provide a short summary including:

- **Test coverage improvement** achieved
- **Test files created/updated** with changes
- **Test categories added** (unit, integration, e2e)
- **Coverage metrics** - confirmation of test coverage percentages
- Status: **Ready for review**

---

## Resources

- Test frameworks: Jest, React Testing Library, Supertest
- Coverage tools: Istanbul/NYC for backend, built-in for frontend
- ESLint test configs: Separate configurations may exist for test files
- Project testing standards: `.clinerules/rules/oasm-coding-rules.md`
