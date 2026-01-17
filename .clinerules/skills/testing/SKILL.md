---
name: testing
description: Create and maintain comprehensive test coverage with 80%+ business logic coverage, following TDD principles and proper test organization. Use when adding or improving tests.
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
