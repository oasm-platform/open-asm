# Cline Skills for Open-ASM Project

This directory contains specialized skills for the Open-ASM project that extend Cline's capabilities for specific development tasks. Each skill provides detailed guidance and workflows for particular aspects of the codebase.

## Available Skills

### [api-development](./api-development/SKILL.md)

- **Purpose**: Develop and modify REST APIs in the core-api with strict adherence to project standards, DTO patterns, and automated validation
- **When to use**: Creating new APIs or modifying existing ones in the backend

### [console-ui](./console-ui/SKILL.md)

- **Purpose**: Develop React components and UI features for the console frontend with TypeScript, accessibility, and proper API integration
- **When to use**: Creating or modifying UI components in the console directory

### [refactoring](./refactoring/SKILL.md)

- **Purpose**: Safely refactor code while preserving behavior, maintaining test coverage, and improving internal quality
- **When to use**: Restructuring existing code without changing functionality

### [testing](./testing/SKILL.md)

- **Purpose**: Create and maintain comprehensive test coverage with 80%+ business logic coverage, following TDD principles and proper test organization
- **When to use**: Adding or improving tests

### [bug-fixing](./bug-fixing/SKILL.md)

- **Purpose**: Systematically fix bugs with root cause analysis, targeted fixes, and comprehensive regression testing
- **When to use**: Addressing reported issues or defects

### [ci-cd-fix](./ci-cd-fix/SKILL.md)

- **Purpose**: Fix CI/CD pipeline issues with environment analysis, Docker optimization, and deployment validation
- **When to use**: Addressing build, test, or deployment failures in CI/CD

### [pr-review](./pr-review/SKILL.md)

- **Purpose**: Conduct thorough PR reviews using GitHub CLI, analyzing changes, testing, and providing constructive feedback
- **When to use**: Reviewing pull requests

### [self-improvement](./self-improvement/SKILL.md)

- **Purpose**: Reflect on tasks and propose improvements to active rules based on user feedback and experience
- **When to use**: Identifying opportunities to enhance workflows or rules

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
