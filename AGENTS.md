# Open-ASM Agent Quick Reference

**Critical**: This file contains only non-obvious, repo-specific facts agents would likely miss. Generic language/framework advice is intentionally omitted.

## Repository Layout

Monorepo with 3 services:
- `core-api/` — NestJS 11 backend (TypeScript). REST API, DB layer, auth, gRPC server, BullMQ queues, AI/LLM integration (AI SDK, LangGraph, MCP).
- `console/` — React 19 frontend (TypeScript/Vite/Tailwind v4). TanStack Query, orval for API client gen, shadcn/radix-ui components.
- `worker/` — Go-based scanning workers (cobra CLI + viper config). Two entry points: `cmd/cli` (CLI mode) and `cmd/app` (app mode). Uses `oasm-sdk-go` for API calls, gRPC to core-api, go-rod for browser automation.

Root `package.json` is an npm workspace for `core-api` + `console` only. Worker is Go (separate toolchain).

Shared infra: PostgreSQL (pgvector/pg17), Redis, geo-ip proxy. See `docker-compose.yml`.

## Key Commands (Use taskfile)

```bash
# Full project
task init          # Install all deps + worker tools
task dev           # API + Console dev servers (hot reload)
task test          # Run API tests only (console tests commented out in root taskfile)
task lint          # Lint core-api + console
task build         # Build all (API + Console + Worker)

# Per-service
task api:test      # core-api tests only
task api:lint      # core-api lint
task console:lint  # console lint
task worker:dev    # Run worker (CLI mode)
task worker:dev-app  # Run worker (app mode)
task worker:dev replicas=3 maxJobs=10  # Multi-instance workers

# Codegen (MUST run after API contract changes)
task gen-api       # Regenerate console API hooks/types via orval (from .open-api/open-api.json)
task proto         # Regenerate gRPC stubs to grpc-client/ (Go + TS)

# Database (run from repo root)
task migration:generate MIGRATION_NAME=Name
task migration:run
task migration:revert

# Docker
task docker-compose  # Full stack (API, Console, 3 workers, DB, Redis, geo-ip)
```

**Important**: `task gen-api` must be run after **any** API contract change. It regenerates `console/src/services/apis/gen/queries.ts` from `.open-api/open-api.json`. The worker uses a separate Go SDK (`oasm-sdk-go`) — update that independently.

## Local Dev Setup

1. `task init` (copies `.env` templates, installs deps, worker tools)
2. Ensure PostgreSQL + Redis running (or `task docker-compose` for full stack)
3. `task dev` starts API (`:6276`) + Console dev server
4. `task worker:dev` starts worker locally (needs `WORKER_API_KEY` matching API)

## Configuration Files & Linting

### core-api (NestJS/TypeScript)
- `eslint.config.mjs` — Strict type-checked rules. Key rules:
  - `no-console: error` — Never use console.log in prod code
  - `@typescript-eslint/no-floating-promises: error` — Must await/handle all promises
  - `@typescript-eslint/no-misused-promises: error` — No async in sync contexts
  - `@typescript-eslint/no-explicit-any: warn` (relaxed in tests)
  - `@typescript-eslint/consistent-type-imports: error`
- `.prettierrc` — Single quotes, semicolons, 2-space indent.
- `tsconfig.json` — `@/` alias maps to `src/`. Jest `moduleNameMapper` mirrors this.
- Lint command: `npm run lint` (includes `--fix`).

### console (React/TypeScript)
- `eslint.config.js` — React hooks + refresh plugin rules.
- `.prettierrc` — Same as core-api.
- `orval.config.ts` — Generates API hooks from `.open-api/open-api.json` → `src/services/apis/gen/queries.ts`. Auto-detects pagination ops (endpoints with `page` param get infinite queries).
- `src/services/apis/gen/` — **Generated code, do not edit manually**.

### worker (Go)
- `task worker:format` — Run `go fmt ./...`.
- `task worker:lint` — Run `go vet ./...`.
- `task worker:check` — Verify compilation without building binary.
- `task worker:tools` installs security tools (subfinder, nuclei, naabu, httpx, dnsx) into `worker/oasm-tools/`.

## Environment Variables

Each service has its own `.env` (not committed, gitignored):
- `core-api/.env` — DB, Redis, PORT (6276), gRPC port (16276), OASM_CLOUD_APIKEY, AI_ASSISTANT_URL, MCP config
- `console/.env` — `VITE_API_URL` (dev: `http://localhost:6276`)
- `worker/.env` — `WORKER_API_KEY`, `WORKER_MAX_CONCURRENCY`, `WORKER_GRPC_HOST`, `WORKER_GRPC_PORT`

**Agents**: Never commit `.env` files. `.gitignore` blocks them.

## Architecture Patterns

### Backend (core-api)
- **Controller** → **Service** → **Repository/Entity**. Controllers do validation + mapping only.
- DTOs required for all request/response types (use `class-validator` + `class-transformer`).
- Entities in module folders or `src/common/entity/`.
- **User data responses**: Only `id`, `name`, `image` fields (enforce in services).
- Use `getWorkspaceId: true` on controllers needing workspace context.
- gRPC server on port 16276 (proto files in `src/proto/`).
- BullMQ queues for async job distribution.

### Worker (Go)
- Business logic in `worker/internal/`.
- Two binaries: `cmd/cli` (CLI-driven worker) and `cmd/app` (env-driven worker).
- CLI flags: `--api-key`, `--max-concurrency`, `--network`.
- App mode uses env vars: `WORKER_API_KEY`, `WORKER_MAX_CONCURRENCY`, `WORKER_NETWORK`.
- gRPC client connects to core-api for job pickup/results.

### Frontend (console)
- Components: `components/common/` (shared), `components/ui/` (primitives), `components/[feature]/` (feature-specific).
- Page-specific logic: `pages/[page]/components/`.
- API hooks: Generated by orval as TanStack Query hooks (`use<OperationId>`).
- Custom axios mutator at `src/services/apis/axios-client.ts`.

## Testing

- **core-api**: Jest, `*.spec.ts` alongside source. Mock all external deps. `moduleNameMapper` for `@/` alias.
  - `npm run test` — unit tests
  - `npm run test:e2e` — e2e tests (separate config)
  - `npm run test:watch` — watch mode
- **console**: Tests exist but `task test` skips them (commented in root taskfile). Run `cd console && npm run test` explicitly.
- **worker**: `go test ./...` or `task worker:test`.
- CI: Node.js 22. Runs lint (both services) + test (core-api only) on all PRs/pushes.

## Git Hooks

Husky v9 configured:
- `pre-commit` — **All checks commented out** (no lint/test enforced on commit).
- `commit-msg` — Conventional commits enforced: `feat(scope):`, `fix(scope):`, `hot-fix(scope):`, `perf(scope):`, `chore(scope):`, `docs(scope):`, `style(scope):`, `refactor(scope):`, `test(scope):`, `ci(scope):`. Merge commits allowed.

## Docker

`task docker-compose` starts full stack: API (`:6276`), Console (`:3000`), 3 workers, PostgreSQL (pg17+pgvector), Redis, geo-ip proxy. Migration service runs before API starts.

## MCP Server

MCP server provides AI context over core-api. Config in `core-api/.env`:
- `OASM_CORE_API_URL`, `SEARXNG_URL`
- Runs on `ASSISTANT_HOST:ASSISTANT_PORT` (see `.env`).

## Common Gotchas

1. **API contract changes** → Run `task gen-api` or console hooks will be stale.
2. **Console tests disabled** in root `task test` — run `cd console && npm run test` explicitly.
3. **Migrations** use TypeORM CLI via `task migration:*`. DB config in `core-api/src/database/database-config.ts`.
4. **Worker API key** must match core-api expected key (set in both `.env` files).
5. **Generated code** in `console/src/services/apis/gen/` — edit via regeneration, not manually.
6. **`.open-api/` directory** is gitignored — contains auto-generated OpenAPI spec used by orval.
7. **`no-floating-promises: error`** in core-api ESLint — unhandled promises will fail lint.
8. **CI uses Node.js 22** — ensure local node version is compatible.
