## 🐛 Bug Fix Development Workflow (AI IDE)

> Role: You are a **senior software engineer** working on fixing bugs in this codebase.
> Requirement: Follow **exactly** the workflow below when implementing any bug fix.
> Applies to: All directories in the project

---

### 1. Bug Analysis & Root Cause Identification

- **Reproduce the bug** before implementing any fix
  - Create a minimal reproduction case
  - Document the exact steps to reproduce
  - Identify the expected vs actual behavior

- Identify **root cause** of the bug
  - Trace through the code flow
  - Identify which component/module is responsible
  - Understand the underlying issue (logic error, type mismatch, race condition, etc.)

- Define **scope of the fix**
  - What specifically needs to be fixed
  - Potential side effects of the fix
  - Related areas that might be affected

- Document **edge cases** that might trigger the bug
  - Invalid input scenarios
  - Race conditions
  - Error handling paths

---

### 2. Implementation (Bug Fix)

- **Mandatory**: Create a **targeted fix** that addresses only the identified root cause.
  - Fix the specific issue without changing unrelated functionality
  - Follow existing code patterns and conventions
  - Maintain backward compatibility where possible

- The **Fix must follow**:
  - Strict TypeScript typing (no `any` types)
  - Proper error handling
  - Clean, readable code structure
  - Follow existing naming conventions
  - Minimal changes to achieve the fix

- **Bug Fix Rules**:
  - **First Rule**: Never fix symptoms, always fix the root cause
  - **Second Rule**: Ensure the fix doesn't break existing functionality
  - **Third Rule**: Add proper validation for edge cases that caused the bug
  - **Fourth Rule**: Update related error messages to be more descriptive if applicable
  - **Fifth Rule**: MUST have full documentation comments above every new or modified function

- **Testing Rule**: Before implementing the fix, identify what tests should be added to prevent this bug from recurring.

- **Security Rule**: If the bug involves security vulnerabilities, ensure the fix addresses the vulnerability completely and doesn't introduce new attack vectors.

---

### 3. Test-Driven Development (Bug Fix Tests)

- **Before implementing the fix**, create a test that reproduces the bug (red-green-refactor approach):
  - Create a test case that fails with the current buggy behavior
  - Place test in appropriate location (`*.spec.ts` for backend, `*.test.tsx` for frontend)

- **After implementing the fix**, run the test to ensure it passes:
  - The previously failing test should now pass
  - All existing tests should still pass
  - Add additional test cases for edge cases

- Tests should cover:
  - The specific bug scenario → now fixed
  - Related edge cases that might trigger similar issues
  - Regression testing to ensure existing functionality works
  - Input validation and error handling

- **Mock all external dependencies** to isolate the bug fix in testing.

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
- **Zero tolerance rule**: No linting violations allowed in bug fixes.

### 5. Regression Testing

- Run **all existing tests** to ensure no regressions were introduced:

  ```bash
  # Backend
  cd core-api && npm run test

  # Frontend
  cd console && npm run test
  ```

- **Manual testing**: If applicable, manually test the affected functionality to ensure the fix works as expected in real scenarios.

- **Related functionality testing**: Test related features to ensure they weren't negatively impacted by the fix.

### 6. Documentation & Comments

- Add **English comments** only if the fix addresses non-obvious logic or complex edge cases.
- Update any related documentation if the bug fix changes user behavior or API contracts.
- **No unnecessary comments**: Don't add comments for obvious fixes.

### 7. Completion Summary

Provide a short summary including:

- **Root cause of the bug** that was fixed
- **Files modified** with the fix
- **Test cases added** to prevent regression
- **Regression tests passed** - confirmation that existing functionality still works
- Status: **Ready for review**

---

## Resources

- Existing test suites: `core-api/test/*`, `console/src/**/*.test.*`
- ESLint configurations: `core-api/eslint.config.mjs`, `console/eslint.config.js`
- Project coding standards: `.clinerules/rules/oasm-coding-rules.md`
