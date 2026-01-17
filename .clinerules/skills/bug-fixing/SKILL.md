---
name: bug-fixing
description: Systematically fix bugs with root cause analysis, targeted fixes, and comprehensive regression testing. Use when addressing reported issues or defects.
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
