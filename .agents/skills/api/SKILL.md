---
name: api
description: Workflow for API development and modification with strict checks from design to deployment
---

# API Development & Modification

## When to Use

Use this when building new API endpoints or modifying existing ones in `core-api/`. Covers the full lifecycle from specification through implementation, testing, and generation.

## Process

### 1. Requirement & API Specification

**New API:**
- Define inputs (data types, validation rules, constraints)
- Define outputs (response shape, return types, success/error codes)
- Define business logic (core flow, error scenarios, external dependencies)
- Consider performance (pagination, caching, rate limiting)

**Existing API Modification:**
- Document current behavior vs desired changes
- Assess breaking changes and backward compatibility
- Plan migration strategy for dependent clients

**API Definition (all APIs):**
- HTTP method, endpoint path, request body/query/params
- Swagger documentation via `@Doc()`
- Workspace handling: `getWorkspaceId: true` if `workspaceId` required
- DTOs in `/dtos` with `class-validator`
- Standardized error format with `code`, `message`, `details`

### 2. Implementation: Controller → Service

**Controller:** Routing, DTO validation, request/response mapping only. No business logic. New endpoints before `/:id` routes.

**Service:** All business logic. Strict typing, `async/await`. Consistent error handling with custom exceptions. Performance optimizations (pagination, caching, efficient queries).

**Entity:** Review schema consistency in `src/common/entity/*`. Proper indexing for frequently queried fields.

**User Data Exposure:** Responses limited to `id`, `name`, `image`.

**DTO Rules:** `@ApiProperty()` for Swagger & codegen. Accept minimum required input. Use `DefaultMessageResponseDto` for success messages.

### 3. Service Tests

Service tests are mandatory (`*.service.spec.ts`). Cover valid input, invalid input/edge cases, error handling, and performance. Mock all external dependencies. Use valid UUID v4+ via `randomUUID`.

### 4. Linting & Validation

ESLint and Prettier: 0 errors, 0 warnings.

### 5. Test Verification

All tests pass with 80%+ coverage for business logic.

### 6. Console API Generation

If new API or DTO changes were made, run `task console:gen-api` to regenerate client types.

### 7. Completion Summary

Document what was added/changed, list modified files, confirm tests ✅ lint ✅ coverage ✅, mark **READY FOR REVIEW**.

## Standards

- **HTTP Methods:** GET (retrieve), POST (create), PUT (replace), PATCH (partial), DELETE (remove)
- **Endpoint Routing:** Plural nouns (`/users`), hierarchical (`/users/:userId/orders`), consistent params (`:userId`)
- **DTOs:** Mandatory for Body/Query/Params/Response. Validate with `class-validator`. Success mutations return `{ "message": "Success" }`

## Common Commands

```bash
# Test specific module
npm run test -- <path-to-spec-file>

# Generate console API client types
task console:gen-api

# Lint
npm run lint
```
