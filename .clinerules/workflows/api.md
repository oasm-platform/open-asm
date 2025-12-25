## 🔧 API Development & Modification Workflow (AI-Enforced)

> Role: **Senior Backend Engineer (AI Agent)**
> Scope: `/core-api/modules`
> Rule: **You MUST execute EVERY step below sequentially. Skipping, merging, or reordering steps is NOT allowed.**
> Completion is valid **only if all checkpoints are satisfied**.

<detailed_sequence_of_steps>

# API Development Process - Detailed Sequence of Steps

## 1. Requirement & API Specification (Checkpoint 1)

### A. New API

You MUST explicitly define:

- **Inputs**: Data types, validation rules, constraints.
- **Outputs**: Response shape, return types, success/error codes.
- **Business logic**: Core flow, error scenarios, external dependencies (DB, internal services, third-party APIs).

### B. Existing API Modification

You MUST explicitly document:

- Current behavior vs. Desired changes.
- Breaking changes and backward compatibility impact.
- Migration strategy for dependent clients.

### C. API Definition (Mandatory for all APIs)

- HTTP method, Endpoint path, Request body/query/params.
- Swagger documentation using `@Doc()`.
- Workspace handling: If `workspaceId` is required → set `getWorkspaceId: true`.
- DTOs: Body, Query, Params, Response. Must use `class-validator` and live in `/dtos`.

> ❌ You may NOT proceed to Step 2 until all items in Step 1 are fully specified.

## 2. Implementation: Controller → Service (Checkpoint 2)

### Controller Rules

- MUST exist for new APIs.
- MUST have full documentation comments above every function.
- MUST declare **new endpoints BEFORE any `/:id` routes**.
- Handles ONLY: Routing, DTO validation, Request/response mapping.
- NO business logic.

### Service Rules

- Contains **all business logic**.
- MUST have full documentation comments above every function.
- Strict typing only; use `async/await`.
- English comments **only for non-obvious logic**.

### Entity Rules

- Review schema consistency and relationships in `src/common/entity/*` and module-specific entities.

### User Data Exposure Rule

- User info in responses MUST be limited to: `id`, `name`, `image`.

### DTO Rules (Strict)

- Use `@ApiProperty()` for Swagger & codegen fields.
- Accept **minimum required input only**.
- For success messages (POST/PUT/DELETE), use `DefaultMessageResponseDto`.

> ❌ Do NOT proceed to Step 3 until Controller and Service are fully implemented and compliant.

## 3. Test-Driven Development: Service Tests (Checkpoint 3)

- Service tests are **MANDATORY** (`*.service.spec.ts`).
- Tests MUST cover: Valid input → success, Invalid input / edge cases, Error handling.
- Mock **ALL external dependencies**.
- IDs MUST be valid UUID v4+ using `import { randomUUID } from 'crypto';`.

> ❌ Do NOT proceed to Step 4 until all required tests are written.

## 4. Linting (Checkpoint 4)

- Run ESLint.
- Result MUST be: **0 errors**, **0 warnings**.

> ❌ Any lint issue → fix immediately and re-check.

## 5. Test Verification (Checkpoint 5)

- Run ONLY tests related to modified/created files.
- ALL tests MUST pass.

> ❌ Do NOT proceed to Step 6 unless tests are green.

## 6. Console API Generation (Checkpoint 6)

- Required when: New API is exposed, DTOs change, or Step 1 contract changes.
- Run `task console:gen-api` to update `/console` client types.

> ❌ Skipping this step invalidates the implementation.

## 7. Completion Summary (Checkpoint 7)

Provide a final summary:

- What was added or changed.
- List of modified files.
- Confirmation: Tests ✅, Lint ✅.
- Status: **READY FOR REVIEW**.

> ✅ ONLY after this step is completed is the task considered DONE.

</detailed_sequence_of_steps>

<standards_and_conventions>

# REST API & Coding Standards

## HTTP Methods (CRUD Operations)

- **GET**: Retrieve resources (Idempotent).
- **POST**: Create new resources.
- **PUT**: Update entire resource (Replacement).
- **PATCH**: Partial resource update.
- **DELETE**: Remove resources.

## Endpoint Routing Standards

- Use **plural nouns** (`/users`, not `/user`).
- Use **hierarchical structure** (`/users/:userId/orders`).
- Use **descriptive action endpoints** (`/users/:id/activate`).
- Maintain **consistent parameter naming** (`:userId`, not just `:id`).

## DTO Implementation

- DTOs are **mandatory** for Body, Query, Params, and Response.
- Validate all inputs with `class-validator`.
- Success responses for mutations:
  ```ts
  { "message": "Success" } // DefaultMessageResponseDto
  ```

</standards_and_conventions>

<example_api_workflow>

# Example: Adding a Target Service History API

## Step 1: Specification

- **Endpoint**: `GET /target-services/:id/history`
- **Goal**: Fetch history of metadata changes for a specific target service.
- **Output**: Array of `TargetServiceHistoryDto`.

## Step 2: Implementation

- Create `TargetServiceHistoryDto` in `dtos/`.
- Add method to `TargetServicesController` (before generic ID routes).
- Implement business logic in `TargetServicesService` to query the history table.

## Step 3: Testing

```ts
// target-services.service.spec.ts
it('should return history for a valid service id', async () => {
  const serviceId = randomUUID();
  mockRepo.find.mockResolvedValue([{ id: randomUUID(), change: 'Updated' }]);
  const result = await service.getHistory(serviceId);
  expect(result).toHaveLength(1);
});
```

## Step 4-6: Validation

- `npm run lint`
- `npm run test -- src/modules/targets/target-services.service.spec.ts`
- `task console:gen-api`

</example_api_workflow>

<common_api_commands>

# Common API Development Commands

## Testing

```bash
# Run specific module tests
npm run test -- <path-to-spec-file>

# Example
npm run test -- src/modules/users/users.service.spec.ts
```

## Generation & Linting

```bash
# Generate console API client types
task console:gen-api

# Check linting
npm run lint
```

</common_api_commands>

## Reference

- Base DTOs: `src/common/dto/*`
- Base Entities: `src/common/entity/*`
