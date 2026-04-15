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

## Code Quality Standards

### General Standards
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

### ESLint Rules
- No explicit `any` types (warn in regular code, off in tests)
- No floating promises: `error`
- No unsafe arguments: `off` (for tests only)
- Consistent type imports: `error`
- No console.log: `error`
- Strict equality: `always`
- Semi-colons required
- Single quotes for strings
- Object curly spacing required
- No eval: `error`
- No new Function: `error`

### Prettier Rules
- Single quotes: `true`
- Trailing commas: `all`
- Tab width: `2`
- End of line: `auto`

### Testing Standards
- 80%+ coverage target for business logic
- Unit tests and E2E tests
- Separate ESLint config for test files (relaxed rules for testing)

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

## AI Agents & Subagent System

### Agent Definitions

| Agent | Description | When to use |
|-------|-------------|-------------|
| `api-develop` | Backend API development (controllers, services, DTOs, migrations) | New endpoints, business logic, DB schema changes |
| `ui-develop` | Frontend components (React, hooks, accessibility) | New pages/components, form integration, API hooks |
| `bug-fix` | Bug investigation and root cause analysis | Defects, errors, unexpected behavior |
| `testing` | Test coverage improvement (80%+ business logic target) | Untested modules, coverage gaps, flaky tests |
| `refactoring` | Behavior-preserving code restructuring | Extract/rename/simplify, type safety, deduplication |
| `security-review` | Security vulnerability audit | Auth changes, new endpoints, access control, data exposure |

### Specialized Agent Guides

#### 1. Code Review Agent
**How to start**:
- Check configuration files: `core-api/eslint.config.mjs`, `console/.prettierrc`
- Review TypeScript configuration in `tsconfig.json` files
- Evaluate code following ESLint and Prettier rules
- Focus on type safety and consistent patterns
**Key files**: `core-api/eslint.config.mjs`, `console/.prettierrc`, `tsconfig.json`

#### 2. Security Analysis Agent
**How to start**:
- Review authentication modules: `core-api/src/modules/auth/`
- Check guards and middleware: `core-api/src/common/guards/`
- Examine API keys management: `core-api/src/modules/apikeys/`
- Review MCP security: `core-api/src/mcp/`
**Key files**: `core-api/src/modules/auth/`, `core-api/src/common/guards/`, `core-api/src/modules/apikeys/`, `core-api/src/mcp/`, `console/src/utils/authClient.ts`

#### 3. Performance Optimization Agent
**How to start**:
- Review database queries: `core-api/src/database/`
- Check job processing: `core-api/src/modules/jobs-registry/`
- Analyze worker services: `worker/src/`
- Examine Redis caching: `core-api/src/services/redis/`
**Key files**: `core-api/src/database/`, `core-api/src/modules/jobs-registry/`, `core-api/src/services/redis/`, `worker/src/`

#### 4. UI/UX Enhancement Agent
**How to start**:
- Follow Prettier configuration: `console/.prettierrc`
- Review React components: `console/src/components/`
- Check UI components: `console/src/components/ui/`
- Maintain accessibility standards
**Key files**: `console/.prettierrc`, `console/src/components/`, `console/src/components/ui/`, `console/src/App.css`

#### 5. Integration Agent
**How to start**:
- Review MCP implementation: `core-api/src/mcp/`
- Check tools integration: `core-api/src/modules/tools/`
- Examine data adapters: `core-api/src/modules/data-adapter/`
- Follow API structure: `core-api/src/common/dtos/`
- Review API workflow guidelines: `.clinerules/workflows/api.md`
**Key files**: `core-api/src/mcp/`, `core-api/src/modules/tools/`, `core-api/src/modules/data-adapter/`, `core-api/src/common/dtos/`, `.clinerules/workflows/api.md`

#### 6. Documentation Agent
**How to start**:
- Review existing docs: `README.md`, `DEVELOPER_GUIDE.md`
- Check API documentation: `core-api/src/common/doc/`
- Follow ESLint comments rules
- Maintain JSDoc for public APIs
- Review API workflow for documentation standards
**Key files**: `README.md`, `DEVELOPER_GUIDE.md`, `core-api/src/common/doc/`, `.clinerules/workflows/api.md`

#### 7. Testing Agent
**How to start**:
- Review test structure: `core-api/test/`
- Follow testing ESLint rules
- Focus on business logic coverage (80%+)
- Maintain separate test configurations
- Include API contract testing and performance testing per global rules
**Key files**: `core-api/test/`, `core-api/eslint.config.mjs`

## Skills & External Knowledge

**ALWAYS invoke skills proactively at these milestones:**

| Milestone | Skill to invoke |
|----------|----------------|
| Creating features, building components, adding functionality | `Skill(skill="superpowers:brainstorming")` |
| Building frontend UI, pages, or web components | `Skill(skill="frontend-design")` |
| Writing implementation plan | `Skill(skill="superpowers:writing-plans")` |
| Executing multi-step implementation | `Skill(skill="superpowers:executing-plans")` |
| Bug, test failure, unexpected behavior | `Skill(skill="superpowers:systematic-debugging")` |
| Implementing any feature/bugfix | `Skill(skill="superpowers:test-driven-development")` |
| Verification before completion | `Skill(skill="superpowers:verification-before-completion")` |
| Requesting code review | `Skill(skill="superpowers:requesting-code-review")` |
| Receiving code review feedback | `Skill(skill="superpowers:receiving-code-review")` |
| Finishing development branch | `Skill(skill="superpowers:finishing-a-development-branch")` |
| Creating new skills | `Skill(skill="superpowers:writing-skills")` |
| Finding existing skills | `Skill(skill="find-skills")` |

**Library/Framework questions**: Use Context7 MCP (via `context7-mcp` skill or direct library query). Always fetch current docs for:
- React, Next.js, NestJS, TypeORM, Prisma, Tailwind, etc.
- API syntax, configuration, version migration, CLI usage

**Finding functionality**: If asking "how do I do X", "is there a skill for X", use `Skill(skill="find-skills")`

## Development Workflow

### Environment Setup
```bash
# Install dependencies
cd core-api && npm install
cd ../console && npm install
cd ../worker && cargo build

# Run with Docker Compose
docker-compose up
```

### Best Practices
- Follow conventional commits
- Use TypeScript strict mode
- Apply SOLID principles
- Write tests for business logic (80%+ coverage)
- Use async/await for asynchronous operations
- Follow ESLint and Prettier configurations
- Maintain consistent code style
- Document public APIs and complex logic
- Integrate with automated validation and testing pipelines
- Consider performance implications and security best practices

### Before Committing Checklist
1. Run `task test` - all tests must pass
2. Run `task lint` - clean output required
3. Run `task console:gen-api` if API or DTOs changed
4. Write conventional commit message
