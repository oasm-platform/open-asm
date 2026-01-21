# Cline Skills for Open-ASM Project

This directory contains specialized skills for the Open-ASM project that extend Cline's capabilities for specific development tasks. Each skill provides detailed guidance and workflows for particular aspects of the codebase.

## Available Skills

### [api-development](./api-development/SKILL.md)

- **Purpose**: Develop and modify REST APIs in the core-api with strict adherence to project standards, DTO patterns, and automated validation
- **When to use**: Creating new APIs or modifying existing ones in the backend
- **Key focus**: API contract design, DTO validation, service-layer business logic, test-driven development

### [console-ui](./console-ui/SKILL.md)

- **Purpose**: Develop React components and UI features for the console frontend with TypeScript, accessibility, and proper API integration
- **When to use**: Creating or modifying UI components in the console directory
- **Key focus**: Component architecture, API integration patterns, accessibility, performance optimization

### [refactoring](./refactoring/SKILL.md)

- **Purpose**: Safely refactor code while preserving behavior, maintaining test coverage, and improving internal quality
- **When to use**: Restructuring existing code without changing functionality
- **Key focus**: Behavior preservation, incremental changes, test coverage, code quality gates

### [testing](./testing/SKILL.md)

- **Purpose**: Create and maintain comprehensive test coverage with 80%+ business logic coverage, following TDD principles and proper test organization
- **When to use**: Adding or improving tests
- **Key focus**: Test strategy, coverage targets, test organization, quality gates

### [bug-fixing](./bug-fixing/SKILL.md)

- **Purpose**: Systematically fix bugs with root cause analysis, targeted fixes, and comprehensive regression testing
- **When to use**: Addressing reported issues or defects
- **Key focus**: Root cause analysis, targeted fixes, regression testing, documentation

### [ci-cd-fix](./ci-cd-fix/SKILL.md)

- **Purpose**: Fix CI/CD pipeline issues with environment analysis, Docker optimization, and deployment validation
- **When to use**: Addressing build, test, or deployment failures in CI/CD
- **Key focus**: Environment analysis, Docker optimization, pipeline validation, performance

## Skill Structure

Each skill follows the standard Cline skill format:

- **YAML frontmatter** with name and description
- **Detailed instructions** for the specific task
- **Step-by-step workflows** that align with project standards
- **Integration** with existing project workflows and conventions

## Usage

Skills are automatically detected by Cline when the feature is enabled in Settings → Features → Enable Skills. Cline will load the appropriate skill based on the description matching your request.

## Project Integration

These skills are designed to work seamlessly with the existing workflows in `.clinerules/workflows/` and follow the same coding standards and conventions outlined in the project's documentation.

## Skill Optimization Guidelines

Based on Cline's skill documentation best practices, each skill should:

1. **Have a clear, specific description** that helps Cline decide when to activate
2. **Provide progressive loading** - only load full instructions when triggered
3. **Include step-by-step workflows** that are easy to follow
4. **Reference supporting files** when needed (docs, scripts, templates)
5. **Focus on domain expertise** that would otherwise require repeating instructions

## Current Skills Analysis

### Strengths
- All skills follow the standard Cline format with proper YAML frontmatter
- Skills are well-organized and cover distinct development areas
- Each skill has a clear purpose and activation trigger
- Skills integrate with existing workflows and project standards

### Areas for Improvement
- Some skills could benefit from more specific descriptions to improve activation accuracy
- Supporting files (docs, templates, scripts) could be added to some skills
- Skills could reference specific project patterns more explicitly

## Next Steps

To optimize skills further:

1. Review each skill's description for specificity and clarity
2. Add supporting files where complex workflows need additional documentation
3. Ensure skills reference project-specific patterns and conventions
4. Consider adding skills for other common development tasks (e.g., security reviews, performance optimization, database migrations)

## Related Features

- [Cline Rules](/features/cline-rules) for always-active project guidance
- [Workflows](/features/slash-commands/workflows/index) for explicit task automation
- [Hooks](/features/hooks/index) for injecting custom logic at key moments