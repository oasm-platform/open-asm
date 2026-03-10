---
name: api-development
description: Develop and modify REST APIs in the core-api with strict adherence to project standards, DTO patterns, and automated validation. Use when creating new APIs or modifying existing ones in the backend. Focus on API contract design, DTO validation, service-layer business logic, and test-driven development.
---

# API Development & Modification

Building APIs in this codebase is really about balancing consistency with flexibility. The key insight here is that we're not just writing code that works - we're creating interfaces that become part of the system's contract with the frontend and other services.

## Understanding the API Contract

When you're building a new API, think about the inputs and outputs as your primary contract. The beauty of this approach is that by being explicit about data types, validation rules, and response shapes upfront, you're essentially documenting the API as you build it. For existing APIs, the challenge is usually around backward compatibility - you're not just adding features, you're maintaining trust with existing clients.

The performance considerations are worth highlighting because they often get overlooked. Pagination isn't just about handling large datasets later - if you design with it in mind from the start, you avoid the painful retrofit later. Same goes for caching strategies; knowing that certain endpoints will be hit frequently should influence how you structure your service layer.

## Architecture Patterns That Matter

The controller-service separation here isn't bureaucratic overhead - it's about cognitive load. Controllers handle the translation between HTTP and your domain logic, while services own the business rules. This keeps each layer focused and testable. The rule about declaring new endpoints before `/:id` routes isn't arbitrary; it prevents routing conflicts that can be surprisingly tricky to debug.

DTOs are where this really shines. Rather than exposing your entity structure directly, you're creating purpose-built interfaces. The `class-validator` integration means you get validation at the boundary, which pushes errors back to clients immediately rather than letting them bubble up through your business logic.

## Testing as Design Validation

The emphasis on service tests isn't just about catching bugs - it's about proving your business logic works in isolation. When you mock external dependencies and test with UUID v4 generators, you're creating a controlled environment that validates your core logic. The 80% coverage target isn't a bureaucratic requirement; it's about having confidence that your business rules handle the edge cases that users will inevitably encounter.

## The Frontend Integration Loop

One thing that's easy to miss is the console API generation step. When DTOs change, the `task console:gen-api` command ensures the frontend types stay in sync. This isn't just convenience - it catches contract mismatches early and maintains that consistency between backend expectations and frontend usage.

## Practical Considerations

The endpoint naming conventions (plural nouns, hierarchical structure) aren't just style preferences. They create a predictable API surface that reduces cognitive load for frontend developers and makes the API more discoverable. The workspace handling with `getWorkspaceId: true` is particularly important in multi-tenant scenarios where you need to ensure proper data isolation.

The user data exposure rule reflects real privacy considerations - limiting responses to `id`, `name`, `image` isn't restrictive, it's defensive programming that prevents accidental data leaks. This kind of constraint becomes invaluable as the codebase grows and more developers contribute to it.

## Step-by-Step Workflow

### 1. Requirement & API Specification

**For New APIs:**
- Define inputs: Data types, validation rules, constraints
- Define outputs: Response shape, return types, success/error codes
- Document business logic: Core flow, error scenarios, external dependencies
- Consider performance: Pagination, caching strategies, rate limiting

**For Existing API Modification:**
- Document current behavior vs. desired changes
- Identify breaking changes and backward compatibility impact
- Plan migration strategy for dependent clients
- Assess performance impact

**API Definition (Mandatory):**
- HTTP method, endpoint path, request body/query/params
- Swagger documentation using `@Doc()`
- Workspace handling: If `workspaceId` is required ’ set `getWorkspaceId: true`
- DTOs: Body, Query, Params, Response using `class-validator` in `/dtos`
- Error response structure: Standardized format with `code`, `message`, and optional `details`

### 2. Implementation: Controller ’ Service

**Controller Rules:**
- MUST exist for new APIs
- MUST have documentation comments above complex functions and public APIs
- MUST declare new endpoints BEFORE any `/:id` routes
- Handles ONLY: Routing, DTO validation, Request/response mapping
- NO business logic
- Include standardized error handling with appropriate HTTP status codes

**Service Rules:**
- Contains ALL business logic
- MUST have documentation comments above complex functions and public APIs
- Strict typing only; use `async/await`
- English comments only for non-obvious logic
- Implement consistent error handling patterns using custom exceptions
- Include performance optimizations: pagination, caching, efficient database queries

**Entity Rules:**
- Review schema consistency and relationships in `src/common/entity/*` and module-specific entities
- Ensure proper indexing for frequently queried fields
- Validate foreign key relationships and constraints

**User Data Exposure Rule:**
- User info in responses MUST be limited to: `id`, `name`, `image`
- Implement data masking for sensitive information in all responses

**DTO Rules (Strict):**
- Use `@ApiProperty()` for Swagger & codegen fields
- Accept minimum required input only
- For success messages (POST/PUT/DELETE), use `DefaultMessageResponseDto`
- Implement common base DTOs to reduce boilerplate code where appropriate

### 3. Test-Driven Development: Service Tests

**Service tests are MANDATORY** (`*.service.spec.ts`):
- Tests MUST cover: Valid input ’ success, Invalid input / edge cases, Error handling, Performance scenarios (pagination, large datasets)
- Mock ALL external dependencies
- IDs MUST be valid UUID v4+ using `import { randomUUID } from 'crypto';`
- Include integration tests for database operations and external API calls where applicable

### 4. Automated Validation

- Run ESLint and Prettier automatically via pre-commit hooks or CI pipeline
- Result MUST be: **0 errors**, **0 warnings**
- Code formatting must pass automatically
- Security scanning should be integrated into the pipeline

### 5. Test Verification

- Run ONLY tests related to modified/created files via automated testing pipeline
- ALL tests MUST pass with **80%+ coverage** for business logic
- Include both unit and integration tests in the verification process

### 6. Console API Generation

**Required when:**
- New API is exposed
- DTOs change
- Step 1 contract changes

**Action:**
- Run `task console:gen-api` to update `/console` client types automatically in CI pipeline
- Verify generated types are compatible with frontend usage patterns

### 7. Completion Summary

Provide a final summary including automated verification results:
- What was added or changed
- List of modified files
- Confirmation: Tests , Lint , Coverage , Performance considerations addressed 
- Status: **READY FOR REVIEW**

## Common Commands

```bash
# Run specific module tests
npm run test -- <path-to-spec-file>

# Example
npm run test -- src/modules/users/users.service.spec.ts

# Generate console API client types
task console:gen-api

# Check linting
npm run lint
```

## Reference

- Base DTOs: `src/common/dto/*`
- Base Entities: `src/common/entity/*`