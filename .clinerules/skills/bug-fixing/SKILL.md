---
name: bug-fixing
description: Systematically fix bugs with root cause analysis, targeted fixes, and comprehensive regression testing. Use when addressing reported issues or defects. Focus on root cause analysis, targeted fixes, regression testing, and documentation.
---

# Bug Fix Development

Bug fixing is really about understanding why something went wrong and ensuring it doesn't happen again. The key insight is that you're not just patching symptoms - you're addressing the fundamental issue that caused the problem in the first place.

## Root Cause Analysis as Foundation

The emphasis on reproducing the bug first isn't bureaucratic overhead - it's essential for understanding the problem. Without a reliable reproduction, you can't be sure you've actually fixed the issue or just masked the symptoms. The reproduction case becomes your test for whether the fix worked.

Root cause analysis is where experience really matters. It's tempting to make quick fixes, but understanding the underlying issue helps you create a solution that addresses the real problem rather than just the immediate symptom. This prevents similar issues from arising in other contexts.

The scope definition helps you avoid overreaching. Sometimes when we find a bug, we're tempted to fix everything that looks related. This can introduce new issues and make it harder to verify that your fix actually solved the original problem.

## Targeted Fix Philosophy

The requirement for targeted fixes reflects the understanding that changes have unintended consequences. Every line of code you modify introduces risk. By keeping fixes focused on the specific root cause, you minimize the chance of introducing new problems.

The emphasis on following existing patterns and conventions isn't about stifling creativity - it's about maintaining consistency. Code that follows established patterns is easier for other developers to understand and maintain.

The backward compatibility consideration is crucial in a living codebase. Your fix shouldn't break existing functionality, even if that functionality wasn't the primary focus of your change.

## Testing as Verification

The test-driven approach to bug fixing is particularly elegant. Creating a test that reproduces the bug before fixing it gives you confidence that you've actually resolved the issue. When the test passes, you know your fix worked.

The emphasis on regression testing acknowledges that fixes can have unintended side effects. Running existing tests ensures that your fix didn't break anything else. Manual testing provides an extra layer of verification for complex interactions that might not be captured in automated tests.

## Documentation and Learning

The guidance about comments reflects the understanding that bug fixes often reveal interesting edge cases or unusual scenarios. Comments should explain the fix when the code alone isn't sufficient to explain the reasoning.

The focus on test cases for preventing recurrence shows that bug fixing is also about improving the codebase's resilience. Each bug that gets a test case makes the system more robust against similar issues in the future.

## Step-by-Step Workflow

### 1. Bug Analysis & Root Cause Identification

**Reproduce the bug** before implementing any fix:
- Create a minimal reproduction case
- Document the exact steps to reproduce
- Identify the expected vs actual behavior

**Identify root cause** of the bug:
- Trace through the code flow
- Identify which component/module is responsible
- Understand the underlying issue (logic error, type mismatch, race condition, etc.)

**Define scope of the fix**:
- What specifically needs to be fixed
- Potential side effects of the fix
- Related areas that might be affected

**Document edge cases** that might trigger the bug:
- Invalid input scenarios
- Race conditions
- Error handling paths

### 2. Implementation (Bug Fix)

**Mandatory**: Create a **targeted fix** that addresses only the identified root cause:
- Fix the specific issue without changing unrelated functionality
- Follow existing code patterns and conventions
- Maintain backward compatibility where possible

**The Fix must follow**:
- Strict TypeScript typing (no `any` types)
- Proper error handling
- Clean, readable code structure
- Follow existing naming conventions
- Minimal changes to achieve the fix

**Bug Fix Rules**:
- **First Rule**: Never fix symptoms, always fix the root cause
- **Second Rule**: Ensure the fix doesn't break existing functionality
- **Third Rule**: Add proper validation for edge cases that caused the bug
- **Fourth Rule**: Update related error messages to be more descriptive if applicable
- **Fifth Rule**: MUST have full documentation comments above every new or modified function

**Testing Rule**: Before implementing the fix, identify what tests should be added to prevent this bug from recurring.

**Security Rule**: If the bug involves security vulnerabilities, ensure the fix addresses the vulnerability completely and doesn't introduce new attack vectors.

### 3. Test-Driven Development (Bug Fix Tests)

**Before implementing the fix**, create a test that reproduces the bug (red-green-refactor approach):
- Create a test case that fails with the current buggy behavior
- Place test in appropriate location (`*.spec.ts` for backend, `*.test.tsx` for frontend)

**After implementing the fix**, run the test to ensure it passes:
- The previously failing test should now pass
- All existing tests should still pass
- Add additional test cases for edge cases

**Tests should cover**:
- The specific bug scenario ’ now fixed
- Related edge cases that might trigger similar issues
- Regression testing to ensure existing functionality works
- Input validation and error handling

**Mock all external dependencies** to isolate the bug fix in testing.

### 4. Linting & Code Quality

- Ensure the code passes ESLint with **zero errors and zero warnings**
- Run ESLint on the modified files:

```bash
# For backend
cd core-api && npx eslint src/path/to/modified/files.ts

# For frontend
cd console && npx eslint src/path/to/modified/files.tsx
```

- Fix all lint issues before proceeding
- **Zero tolerance rule**: No linting violations allowed in bug fixes

### 5. Regression Testing

- Run **all existing tests** to ensure no regressions were introduced:

```bash
# Backend
cd core-api && npm run test

# Frontend
cd console && npm run test
```

- **Manual testing**: If applicable, manually test the affected functionality to ensure the fix works as expected in real scenarios
- **Related functionality testing**: Test related features to ensure they weren't negatively impacted by the fix

### 6. Documentation & Comments

- Add **English comments** only if the fix addresses non-obvious logic or complex edge cases
- Update any related documentation if the bug fix changes user behavior or API contracts
- **No unnecessary comments**: Don't add comments for obvious fixes

### 7. Completion Summary

Provide a short summary including:
- **Root cause of the bug** that was fixed
- **Files modified** with the fix
- **Test cases added** to prevent regression
- **Regression tests passed** - confirmation that existing functionality still works
- Status: **Ready for review**

## Common Commands

```bash
# Run specific test file
npm run test -- <path-to-spec-file>

# Run ESLint on specific files
npx eslint <path-to-file>

# Run all tests
npm run test
```

## Resources

- Existing test suites: `core-api/test/*`, `console/src/**/*.test.*`
- ESLint configurations: `core-api/eslint.config.mjs`, `console/eslint.config.js`
- Project coding standards: `.clinerules/rules/oasm-coding-rules.md`