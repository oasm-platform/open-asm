---
name: refactoring
description: Safely refactor code while preserving behavior, maintaining test coverage, and improving internal quality. Use when restructuring existing code without changing functionality.
---

# Code Refactoring

Refactoring in this codebase is fundamentally about improving the internal quality of code while maintaining behavioral equivalence. The key insight is that refactoring isn't about adding features or fixing bugs - it's about making the code better for the next person who has to work with it.

## The Philosophy of Safe Refactoring

The non-negotiable principle of behavior preservation is what separates refactoring from feature development. When you refactor, you're essentially creating a better version of the same program. Users shouldn't notice any difference in functionality, but other developers should find the code easier to understand and modify.

The emphasis on tests as the source of truth reflects a mature testing culture. Your tests document the expected behavior, and refactoring is only successful when those tests continue to pass. This creates confidence that you haven't accidentally introduced bugs while improving the code structure.

## Strategic Refactoring Approach

The analysis phase is crucial because refactoring without understanding the impact can lead to unexpected consequences. Code smells are your guideposts - duplicated logic, overly complex functions, unclear naming - these indicate areas where the code is fighting against its intended purpose.

The impact analysis helps you understand the broader context. What calls this code? What does it depend on? Which areas are particularly sensitive? This knowledge guides how aggressive you can be with your changes.

## Incremental Safety

The incremental approach isn't just about safety - it's about maintainability. Small, focused changes are easier to review, test, and understand. Each step should leave the code in a working state, which means if something goes wrong, you can easily revert to a known good state.

The per-step safety checklist ensures that you're validating your changes frequently. This prevents the accumulation of multiple issues that can be difficult to untangle later.

## Testing as Your Safety Net

The test existence gate is particularly important for legacy code. If a piece of code doesn't have tests, you can't safely refactor it because you don't know what it's supposed to do. Adding tests first establishes the baseline behavior before you make any structural changes.

The rule about not modifying existing tests during refactoring is crucial. Tests should describe the behavior that should remain unchanged. If you find yourself wanting to change tests, you might actually be fixing a bug rather than refactoring.

## Quality Gates

The linting and code quality gates serve multiple purposes. They ensure consistency across the codebase, catch potential issues early, and maintain the standards that make the code readable. The zero-tolerance policy isn't bureaucratic - it's about maintaining quality as the codebase evolves.

## Documentation Considerations

The guidance about comments reflects the understanding that refactoring is about improving code structure, not changing logic. Comments should reflect the new structure, not describe behavioral changes (because there shouldn't be any). This keeps the documentation aligned with the code structure.
