# Open-ASM Project Configuration for Claude Code

Open-source Attack Surface Management platform. Monorepo with **core-api** (NestJS), **console** (React), and **worker** (Bun).

## Project Structure

```
open-asm/
├── core-api/          # NestJS backend (TypeScript)
│   ├── src/modules/   # Feature modules: assets, targets, agents, issues, workflows, etc.
│   ├── src/common/    # DTOs, entities, guards, shared utilities
│   └── test/          # Jest specs (*.spec.ts)
├── console/           # React frontend (TypeScript, Vite)
│   └── src/components/  # UI: common, ui, feature-specific, page-specific
├── worker/            # Task runners (Bun)
└── taskfile.yml       # Task automation
```

## Essential Commands

```bash
task init              # Initialize environment (first time)
task dev               # Start all dev servers
task test              # Run all tests
task api:dev           # Core-api dev server only
task console:dev       # Console dev server only
task worker:dev          # Worker dev server only
task console:gen-api   # Generate frontend API client types (after API changes)
task migration:generate MIGRATION_NAME=Name  # Create DB migration
task migration:run     # Run pending migrations
task lint              # Check linting
```

## Coding Standards

- **TypeScript strict mode** everywhere, zero explicit `any`
- **Single quotes**, **semicolons**, **2-space indent**
- **ESLint**: zero errors/warnings. `no-console: error` in production code
- **Tests**: Jest, 80%+ coverage for business logic. Colocate tests with source
- **AAA pattern** for tests: Arrange → Act → Assert
- **Mock all external dependencies** in unit tests
- **UUIDs** via `import { randomUUID } from 'crypto'`
- **Conventional commits** required
- **Documentation comments** on complex functions and public APIs
- **English comments** only for non-obvious logic

## Core Architecture Patterns

### Backend (core-api)
- **Controller** = routing, DTO validation, request/response mapping (NO business logic)
- **Service** = ALL business logic, strict typing, async/await
- **DTOs** = required for Body, Query, Params, Response using `class-validator`
- **Entities** = in `src/common/entity/*` and module-specific locations
- **User data in responses** = ONLY `id`, `name`, `image`
- **Workspace ID** = set `getWorkspaceId: true` when required
- **New endpoints BEFORE `/:id` routes** in controllers
- **Success mutations** = `DefaultMessageResponseDto`

### Frontend (console)
- **React functional components** with hooks only
- **Components** → `components/common` (shared), `components/ui` (primitives), `components/[feature]` (feature)
- **Page-only components** → `pages/[page]/components`
- **API hooks** = `use<ControllerName><FunctionName>` pattern from generated queries
- **Accessibility** = ARIA attributes, keyboard navigation, WCAG compliance
- **Styling** = existing design system, CSS variables, theme provider
- **Memoization** = `useMemo`/`useCallback` where re-renders matter

### Worker (Bun)
- Services in `worker/services/`
- Auto-generated API client in `worker/services/core-api/`

## Subagent System

When a task involves multiple files or specialized knowledge, delegate to a Task agent. Agent definitions live in `.claude/agents/`.

| Agent | Description | When to use |
|-------|-------------|-------------|
| `api-develop` | Backend API development (controllers, services, DTOs, migrations) | New endpoints, business logic, DB schema changes |
| `ui-develop` | Frontend components (React, hooks, accessibility) | New pages/components, form integration, API hooks |
| `bug-fix` | Bug investigation and root cause analysis | Defects, errors, unexpected behavior |
| `testing` | Test coverage improvement (80%+ business logic target) | Untested modules, coverage gaps, flaky tests |
| `refactoring` | Behavior-preserving code restructuring | Extract/rename/simplify, type safety, deduplication |
| `security-review` | Security vulnerability audit | Auth changes, new endpoints, access control, data exposure |

Usage: `Task(subagent_type="<agent-name>", prompt="<describe the task>")`

For detailed step-by-step workflows, see `.kilocode/workflows/`.

## Before Committing

1. Run `task test` - all tests must pass
2. Run `task lint` - clean output required
3. Run `task console:gen-api` if API or DTOs changed
4. Write conventional commit message
