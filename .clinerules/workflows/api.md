## 🔧 API Development & Modification Workflow (AI-Enforced)

> Role: **Senior Backend Engineer (AI Agent)**
> Scope: `/core-api/modules`
> Rule: **You MUST execute EVERY step below sequentially. Skipping, merging, or reordering steps is NOT allowed.**
> Completion is valid **only if all checkpoints are satisfied**.

---

## Global Execution Rules (Mandatory)

- Follow steps **1 → 7 in order**.
- Each step must be **explicitly completed** before moving to the next.
- If any step fails (lint, tests, missing docs, etc.) → **go back and fix before proceeding**.
- Do NOT assume or auto-skip any step.
- Do NOT produce a final answer until **Step 7 is completed**.

---

## 1. Requirement & API Specification (Checkpoint 1)

### A. New API

You MUST explicitly define:

- **Inputs**
  - Data types
  - Validation rules
  - Constraints

- **Outputs**
  - Response shape
  - Return types
  - Success / error codes

- **Business logic**
  - Core flow
  - Error scenarios
  - External dependencies (DB, internal services, third-party APIs)

### B. Existing API Modification

You MUST explicitly document:

- Current behavior
- Desired changes
- Breaking changes (if any)
- Backward compatibility impact
- Migration strategy for dependent clients

### C. API Definition (Mandatory for all APIs)

- HTTP method
- Endpoint path
- Request body / query / params
- Swagger documentation using `@Doc()`
- Workspace handling:
  - If `workspaceId` is required → set `getWorkspaceId: true`

- DTOs:
  - Body DTO
  - Query DTO
  - Params DTO
  - Response DTO
  - All DTOs must use `class-validator`
  - DTOs must live in `/dtos` of the module

> ❌ You may NOT proceed to Step 2 until all items in Step 1 are fully specified.

---

## 2. Implementation: Controller → Service (Checkpoint 2)

### Controller Rules

- MUST exist for new APIs
- MUST declare **new endpoints BEFORE any `/:id` routes**
- Handles ONLY:
  - Routing
  - DTO validation
  - Request/response mapping

- NO business logic

### Service Rules

- Contains **all business logic**
- Strict typing only
- Use `async/await`
- English comments **only for non-obvious logic**

### Entity Rules

- If modifying or creating an Entity:
  - FIRST review all related entities in:
    - `src/common/entity/*`
    - Module-specific entities

  - Ensure schema consistency and relationships

### User Data Exposure Rule

- User info in responses MUST be limited to:
  - `id`
  - `name`
  - `image`

### DTO Rules (Strict)

- DTOs are **mandatory** for:
  - Body
  - Query
  - Params
  - Response

- Prefer extending existing entities
- Use `@ApiProperty()` for Swagger & codegen fields
- Accept **minimum required input only**
- Validate all inputs with `class-validator`

> ❌ Do NOT proceed to Step 3 until Controller and Service are fully implemented and compliant.

---

## 3. Test-Driven Development: Service Tests (Checkpoint 3)

### New APIs

- Service tests are **MANDATORY**
- File: `*.service.spec.ts`
- Tests MUST cover:
  - Valid input → success
  - Invalid input / edge cases
  - Error handling (DB, dependencies)

### Existing API Modifications

- Update or create service tests
- Ensure:
  - New behavior is tested
  - No regression in existing behavior
  - Backward compatibility (if required)

### Mocking Rules

- Mock **ALL external dependencies**
- IDs MUST be valid UUID v4+ using:

```ts
import { randomUUID } from 'crypto';
```

> ❌ Do NOT proceed to Step 4 until all required tests are written.

---

## 4. Linting (Checkpoint 4)

- Run ESLint
- Result MUST be:
  - **0 errors**
  - **0 warnings**

> ❌ Any lint issue → fix immediately and re-check.

---

## 5. Test Verification (Checkpoint 5)

- Run ONLY tests related to modified/created files

```bash
npm run test -- <module-path>/<file-name>.service.spec.ts
```

Example:

```bash
cd core-api
npm run test -- src/modules/users/users.service.spec.ts
```

- ALL tests MUST pass
- If tests fail:
  - Fix implementation
  - OR update tests first if requirements changed

> ❌ Do NOT proceed to Step 6 unless tests are green.

---

## 6. Console API Generation (Checkpoint 6)

### Required When:

- New API is exposed to frontend
- DTOs change
- Endpoint behavior or contract changes

Run:

```bash
task console:gen-api
```

- Ensure `/console` client types & methods are updated
- Generated files MUST be committed with feature code

> ❌ Skipping this step invalidates the implementation.

---

## 7. Completion Summary (Checkpoint 7)

Provide a final summary including:

- What was added or changed
- List of modified files
- Confirmation:
  - Tests ✅
  - Lint ✅

- Status: **READY FOR REVIEW**

> ✅ ONLY after this step is completed is the task considered DONE.

---

## Reference

- Base DTOs: `src/common/dto/*`
- Base Entities: `src/common/entity/*`
