## ♻️ Refactoring Development Workflow (AI IDE)

> Role: You are a **senior software engineer** working on refactoring code in this codebase.
> Requirement: Follow **exactly** the workflow below when implementing any refactoring changes.
> Applies to: All directories in the project

---

### 1. Refactoring Analysis & Planning

- **Identify refactoring scope** and objectives
  - What code needs to be refactored (specific files, functions, classes)
  - Why refactoring is needed (code smells, performance, maintainability, readability)
  - Expected outcomes and benefits

- Conduct **impact analysis**
  - Identify all files and components that depend on the code to be refactored
  - Map out usage patterns and call chains
  - Identify potential breaking changes

- Define **refactoring approach**
  - Extract methods/classes
  - Rename variables/functions for clarity
  - Simplify complex logic
  - Improve modularity and separation of concerns
  - Apply design patterns where appropriate

- Create **migration plan** for breaking changes
  - How to handle dependent code
  - Backward compatibility strategy
  - Testing strategy during refactoring

---

### 2. Implementation (Refactoring)

- **Mandatory**: Perform **behavior-preserving transformations** only.
  - Refactoring should not change the external behavior of the code
  - Focus on improving internal structure and readability
  - Maintain all existing functionality and contracts

- The **Refactoring must follow**:
  - Strict TypeScript typing (preserve existing types, improve where possible)
  - No functional changes to the code's behavior
  - Clean, readable code structure improvements
  - Follow existing naming conventions unless renaming for clarity
  - Preserve existing public APIs and interfaces

- **Refactoring Rules**:
  - **First Rule**: Never combine refactoring with feature additions - keep them separate
  - **Second Rule**: Make small, incremental changes and test frequently
  - **Third Rule**: Preserve all existing test cases and ensure they still pass
  - **Fourth Rule**: Update documentation and comments to reflect structural changes

- **Testing Rule**: Ensure comprehensive test coverage exists before starting refactoring to catch any accidental behavioral changes.

- **Safety Rule**: If refactoring introduces any functional changes, stop and create a separate PR for the feature/fix instead of combining with refactoring.

---

### 3. Test-Driven Development (Refactoring Tests)

- **Before refactoring**, run all existing tests to establish baseline:
  - Execute all tests related to the code being refactored
  - Ensure all tests pass before making changes
  - Document any pre-existing test failures

- **During refactoring**, run tests frequently after each small change:
  - Verify that no functionality has been accidentally altered
  - Catch behavioral changes immediately
  - Maintain confidence in the refactoring process

- **After refactoring**, run comprehensive test suite:
  - All original tests should still pass
  - Run integration tests to ensure no hidden dependencies broke
  - Add new tests if the refactored code reveals uncovered scenarios

- Tests should verify:
  - Same input produces same output (behavior preservation)
  - Error handling still works as expected
  - Performance characteristics are maintained or improved
  - Edge cases still function correctly

- **Mock all external dependencies** to ensure refactoring doesn't affect integration points.

---

### 4. Linting & Code Quality

- Ensure the code passes ESLint with **zero errors and zero warnings**.
- Run ESLint on the modified files:

  ```bash
  # For backend
  cd core-api && npx eslint src/path/to/modified/files.ts

  # For frontend
  cd console && npx eslint src/path/to/modified/files.tsx
  ```

- Fix all lint issues before proceeding.
- **Zero tolerance rule**: No linting violations allowed in refactored code.
- **Improvement rule**: Use refactoring opportunity to improve code style and consistency where possible.

### 5. Integration Testing

- Run **full test suites** to ensure no regressions were introduced:

  ```bash
  # Backend
  cd core-api && npm run test

  # Frontend
  cd console && npm run test
  ```

- **Dependency verification**: Test all dependent components to ensure they still work with refactored code.
- **Performance testing**: Verify that refactoring didn't introduce performance regressions (if performance is critical for the refactored code).

### 6. Documentation & Comments

- Update **English comments** to reflect structural changes made during refactoring.
- Update any inline documentation that references the refactored code structure.
- **No functional comments**: Don't add comments explaining what the code does differently (it shouldn't be doing anything differently).

### 7. Completion Summary

Provide a short summary including:

- **What was refactored** and why
- **Files modified** during the refactoring
- **Breaking changes** (if any) and how they were handled
- **Tests passed** - confirmation that all functionality remains intact
- Status: **Ready for review**

---

## Resources

- Existing test suites: `core-api/test/*`, `console/src/**/*.test.*`
- ESLint configurations: `core-api/eslint.config.mjs`, `console/eslint.config.js`
- Project coding standards: `.clinerules/rules/oasm-coding-rules.md`
