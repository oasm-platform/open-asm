# AI Agents Coding Rules and Guidelines for Open-ASM

Open-source Attack Surface Management platform. Monorepo with **core-api** (NestJS), **console** (React), and **worker** (Rust).

## Project Structure

```
open-asm/
├── core-api/          # NestJS backend (TypeScript)
│   ├── src/modules/   # Feature modules: assets, targets, agents, issues, workflows, etc.
│   ├── src/common/    # DTOs, entities, guards, shared utilities
│   └── test/          # Jest specs (*.spec.ts)
├── console/           # React frontend (TypeScript, Vite)
│   └── src/components/  # UI: common, ui, feature-specific, page-specific
├── worker/            # Task runners (Rust)
└── taskfile.yml       # Task automation
```

## Essential Commands

### Global Tasks
- `task init`: Initialize environment, install dependencies, and start infra.
- `task dev`: Start API and Console dev servers.
- `task test`: Run all available tests.
- `task lint`: Check linting across the project.
- `task console:gen-api`: Generate frontend API client types (run after API changes).
- `task migration:generate MIGRATION_NAME=Name`: Create DB migration.
- `task migration:run`: Run pending migrations.

### Core-API (NestJS)
- `cd core-api && npm run start:dev`: Start dev server.
- `cd core-api && npm run lint`: Lint API code.
- `cd core-api && npm run test`: Run all tests.
- `cd core-api && npm run test -- <path-to-file>`: Run a single test file.

### Console (React)
- `cd console && npm run dev`: Start dev server.
- `cd console && npm run lint`: Lint frontend code.
- `cd console && npm run build`: Create production build.

### Worker (Rust)
- `cd worker && cargo run`: Start worker.
- `cd worker && cargo build`: Build worker.
- `cd worker && cargo test`: Run all tests.
- `cd worker && cargo test <test_name>`: Run a specific test.
- `cd worker && cargo clippy -- -D warnings`: Run linter.
- `cd worker && cargo fmt`: Format code.

## Code Quality Standards

### TypeScript (Core-API & Console)
- **Strict Mode**: TypeScript strict mode everywhere, zero explicit `any`.
- **Formatting**: Single quotes, semicolons, 2-space indent.
- **Linting**: Zero ESLint errors/warnings. `no-console: error` in production code.
- **Testing**: Jest for API. AAA pattern (Arrange → Act → Assert). Mock all external dependencies.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes/types.
- **Imports**: Use absolute paths via `@/` aliases where configured.

### Rust (Worker)
- **Formatting**: `rustfmt` (2021 edition).
- **Linting**: `clippy` with `cargo clippy -- -D warnings`.
- **Error Handling**: Use `Result<T, E>` and propagate with `?`. Wrap errors with `anyhow` or custom enums.
- **Async**: Use `tokio` runtime; avoid blocking calls in async functions.
- **Logging**: Use `tracing` crate; no `println!` in production.
- **Testing**: `cargo test` with >80% coverage for business logic. Use `mockall` for mocks.

## Core Architecture Patterns

### Backend (core-api)
- **Controller**: Routing, DTO validation, request/response mapping. No business logic.
- **Service**: All business logic, strict typing, async/await.
- **DTOs**: Required for Body, Query, Params, Response using `class-validator`.
- **Entities**: Located in `src/common/entity/*` or module-specific folders.
- **User Data**: Responses must only include `id`, `name`, `image`.
- **Workspace**: Use `getWorkspaceId: true` when workspace context is required.

### Frontend (console)
- **Components**: Functional components with hooks.
- **Organization**: `components/common` (shared), `components/ui` (primitives), `components/[feature]` (feature).
- **Page Components**: `pages/[page]/components` for page-specific logic.
- **API Hooks**: Follow `use<ControllerName><FunctionName>` pattern.
- **Styling**: Use existing design system, Tailwind CSS, and theme provider.

### Worker (Rust)
- **Services**: Business logic in `worker/services/`.
- **API Client**: Auto-generated API client for core-api communication.

## AI Agents & Specializations

| Agent | Focus | Key Areas |
|-------|-------|------------|
| `api-develop` | Backend API | Controllers, Services, DTOs, Migrations |
| `ui-develop` | Frontend UI | React components, Hooks, Accessibility |
| `bug-fix` | Debugging | Root cause analysis, Fixing defects |
| `testing` | Quality | Test coverage (target 80%+), Integration tests |
| `refactoring` | Structure | Type safety, Deduplication, Simplification |
| `security-review`| Security | Auth, Access control, Data exposure |

## Development Workflow

1. **Feature Start**: Use `brainstorming` skill to define requirements.
2. **Implementation**:
   - For API: Define DTO $\rightarrow$ Entity $\rightarrow$ Service $\rightarrow$ Controller.
   - For UI: Create UI primitives $\rightarrow$ Feature component $\rightarrow$ Page integration.
   - For Worker: Implement logic $\rightarrow$ Define gRPC/API interface $\rightarrow$ Test.
3. **Verification**:
   - Run `task lint` and `task test`.
   - For API changes, run `task console:gen-api`.
4. **Completion**: Run `verification-before-completion` skill before claiming success.
