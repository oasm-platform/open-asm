## 🔧 New Feature / API Endpoint Workflow (AI IDE)

> Role: You are a **senior backend engineer** working on this codebase.
> Requirement: Follow **exactly** the workflow below when implementing any new feature or API endpoint.
> Folder: `/core-api/modules`

---

### 1. Requirement & API Specification

- Identify **inputs**
  - Data types
  - Validation rules
  - Constraints

- Define **outputs**
  - Response shape
  - Return types
  - Success / error codes

- Describe **business logic**
  - Core flow
  - Error cases
  - External dependencies (DB, internal services, third-party APIs)

- For APIs, specify:
  - HTTP method
  - Endpoint path
  - Request body / query parameters
  - Use `@Doc()` decorator to add Swagger documentation
  - Important: If the endpoint requires **workspaceId**, set `getWorkspaceId: true` in the request object
  - Important: Alway make Dto for Body, Query, Params and Response and use class-validator for validation (folder /dtos of module)

  Example:

  ```typescript
  @Doc({
  summary: 'Summary of the endpoint',
  description: 'Description of the endpoint',
  response: {
      serialization: TypeOfResponseDto,
  },
  request: {
      getWorkspaceId: true, // true if use @WorkspaceId() decorator
  }
  })
  @Post()
  createIssue(
  @Body() dto: BodyRequestDto,
  @WorkspaceId() workspaceId: string, // If you want get workspaceId from request header
  ) {
  return this.issuesService.create(createIssueDto, workspaceId);
  }
  ```

---

### 2. Implementation (Controller → Service)

- **Mandatory**: Create or update a **Controller** and define **at least one API endpoint**.

- **Important**: All new API endpoints **must be declared before any route that contains `/:id` in the path** to avoid unintended route matching.

- The **Controller must only handle**:
  - Routing
  - DTO validation
  - HTTP request/response mapping

- The Controller **must delegate all business logic to a Service**.

- Implement the **Service**, which contains the complete business logic.

- Implement **only what is required** for the feature/API.

- Follow project architecture and naming conventions.

- Use strict typing and `async/await`.

- Add **English comments only for non-obvious logic**.

- **Entity Modification Rule**: If creating or modifying an Entity (database model), **you must first read and understand all existing related Entities** to ensure consistency with the database structure and relationships. This includes reviewing existing Entities in `src/common/entity/*` and module-specific Entities.

- **Important Note**: User information should only return (id, name, image) when exposing user data in API responses.

- **DTO Creation Rule**: **Always** create DTOs for Body, Query, Params, preferably extending from the original entity of the business with the fields being used, and use `@ApiProperty()` for fields that you want to display in swagger and code generation. DTO files should be created in the `/dto` folder of the respective module.

- **Validation Rule**: Always use class-validator to validate input data in DTOs. Input fields such as body should only accept minimum required data and be validated for correct data types.

---

### 3. Test-Driven Development (Service Tests)

- After the required Controller and Service are implemented, **tests for the Service are mandatory**.

- Create the test file in the correct module (`*.service.spec.ts`).

- Tests must cover:
  - Valid input → success case
  - Invalid input / edge cases
  - Error handling (DB errors, dependency failures, etc.)
  - Mock data containing id must be valid uuid v4 or higher.

- **Mock all external dependencies** (repositories, other services, third-party APIs).

- **Controller tests are optional** unless the Controller contains special logic.

---

### 4. Linting

- Ensure the code passes ESLint with **zero errors and zero warnings**.
- Fix all lint issues before proceeding.

---

### 5. Test Verification

- Run **only the tests related to the files that were created or modified**.
- Use the following command following the NestJS test file pattern:

```bash
npm run test -- <module-path>/<file-name>.service.spec.ts
```

**Example:**

```bash
cd core-api && npm run test -- src/modules/users/users.service.spec.ts
```

- Ensure **all related tests pass**.
- If tests fail → fix the implementation.
- If requirements change → **update tests first**, then update the code.

---

### 6. Console API Generation (Required for New APIs)

- Run the API generation command:

```bash
task console:gen-api
```

- Ensure `/console` client types and methods are updated.
- Commit **generated files together with the feature code**.

---

### 7. Completion Summary

Provide a short summary including:

- **What was added or changed**
- **Files modified**
- Confirmation that **tests pass** and **lint is clean**
- Status: **Ready for review**

---

## Resources

- Base DTOs: `src/common/dto/*`
- Base Entities: `src/common/entity/*`
