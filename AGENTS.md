<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# Open-ASM Agent Quick Reference

**Critical**: this file contains only non-obvious, repo-specific facts an agent would otherwise get wrong. Generic language/framework advice is intentionally omitted.

## Hard Rules (read before touching anything)

1. **All commands go through `task` from the repo root.** Never `npm run`, `pnpm run`, `npx <bin>`, or raw `go test/go build/go vet`. The taskfiles carry the RAM/CPU limits and transform config that raw scripts bypass (`task lint` is sequential, `task test` uses `--maxWorkers=50% --workerIdleMemoryLimit=512MB` + SWC). If a needed entry is missing, **add it to the taskfile** — do not invoke the raw script.
2. **Never create or hand-write a database migration.** See [Database Migrations](#database-migrations--hard-rule) — this is the single most-violated rule in this repo. No permission, no migration file.
3. **Never run the TypeORM CLI, `psql` DDL, or any schema command directly.** Schema work happens only through `task migration:*`.
4. **Never hand-edit generated code**: `console/src/services/apis/gen/`, `console/src/routeTree.gen.ts`, `worker/internal/gen/`, `.open-api/*`, `core-api/resources/connectors/manifest.json`. Change the source, re-run the generator. (`.open-api/` is generated *and* git-tracked — see gotcha 7.)
5. **Never commit `.env`** (gitignored). Copy from `*/example.env` / `worker/.example.env` via `task init` (the worker one is manual).
6. **Ask before scope-creep.** Schema changes, new public API contracts, dependency bumps, and CI/workflow edits need explicit user sign-off — do not add them "while you're in there".
7. **`.agents/skills/*` is third-party and hash-pinned in `skills-lock.json`** (synced by `npx @tanstack/intent`). Several of those skills tell you to run `npm run test` / `npm run lint` — ignore that, hard rule 1 wins. Never edit files under `.agents/skills/`; they are overwritten on the next sync.

## Repository Layout

pnpm workspace (`pnpm-workspace.yaml`, `packageManager: pnpm@10.33.2`) with 2 Node packages + 1 Go service:

- `core-api/` — NestJS 11 (TypeScript). REST API, TypeORM DB layer, better-auth, gRPC server (`:16276`), BullMQ, AI/LLM (AI SDK v6, LangGraph), MCP HTTP endpoint, storage (RustFS/S3), PDF reports, integrations (AWS, Cloudflare, Vercel), notifications (Telegram), i18n. Modules in `src/modules/*` (30+ domains: `assets`, `asset-group`, `jobs-registry`, `workers`, `vulnerabilities`, `audit`, `workspaces`, `connectors`, `tools`, `workflows`, `storage`, `remote-execute`, `integrations`, `mcp` lives in `src/mcp`).
- `console/` — React 19 + Vite 8 + Tailwind v4. TanStack **Router** (file-based, `src/routes/` → generated `routeTree.gen.ts`) + TanStack Query, orval API client, shadcn/radix-ui/base-ui, recharts/echarts, xyflow, leaflet, Playwright e2e in `console/e2e/`.
- `worker/` — Go 1.26 scanning worker (cobra + viper). Two entry points: `cmd/cli` (interactive TUI / headless) and `cmd/app` (env-driven, used by the Docker image). Talks to core-api over gRPC (`worker/internal/grpcclient/`, stubs in `worker/internal/gen/`), **spawns connector containers through the Docker Engine API** (`worker/internal/runtime/docker.go`), serves the connector callback gRPC on `:26276` (`worker/internal/connector/`), go-rod browser automation.

Shared infra (see `docker-compose.yml`): PostgreSQL `pgvector/pgvector:pg17` (`:5432`), Redis (`:6379`), geo-ip proxy (`:4360`), RustFS S3 (`:9000`, admin UI `:9001`).

## Key Commands (via `task`, from the repo root)

Root `taskfile.yml` `includes` three sub-taskfiles (`core-api/`, `console/`, `worker/`) and loads `dotenv` from all three `.env` files.

```bash
# Full project
task init              # pnpm install + go mod tidy + copy example.env + start postgres/redis
task dev               # api:dev + console:dev (NODE_ENV=development)
task prod              # api:prod (NODE_ENV=production)
task build             # api + console + worker (worker cross-compiles cli + app)
task test              # api:test ONLY (console:test is commented out in the root taskfile)
task lint              # api:lint THEN console:lint — SEQUENTIAL, never parallelize
task clean             # node_modules + dist + worker/bin

# core-api
task api:dev
task api:build
task api:lint
task api:test          # jest --maxWorkers=50% --workerIdleMemoryLimit=512MB --silent (SWC)
task api:test:one SPEC=src/modules/storage/storage.service.spec.ts   # single file, same limits
task api:test:e2e      # boots full AppModule — needs postgres + redis up
task api:prod

# console
task console:dev       # vite dev server :5173
task console:lint
task console:test      # vitest WATCH mode (root `task test` skips console entirely)
task console:test:run  # single pass, CI equivalent (`vitest run`)

# worker
task worker:dev        # cmd/cli, node mode, connector auto-detect allowed locally
task worker:dev-app    # cmd/app, env-driven
task worker:dev replicas=3 maxJobs=10 network=<id> apiKey=<key>
task worker:lint       # go vet ./...
task worker:format     # go fmt ./...
task worker:check      # go build ./... (compile check)
task worker:test       # go test ./...
task worker:test-race  # go test -race ./... (use for concurrency changes)
task worker:build      # bin/oasm-cli + bin/oasm-app
task worker:install    # go mod tidy

# Codegen (MUST run after contract changes)
task gen-api           # orval: .open-api/open-api.json -> console/src/services/apis/gen/queries.ts (API must be booted; commit the regenerated spec too)
task proto             # protoc -> worker/internal/gen/** (Go stubs; installs the 2 protoc plugins)
task sync-connectors   # node scripts/sync-tool-manifest.mjs -> core-api/resources/connectors/manifest.json

# Database — see the hard rule below before using any of these
task migration:generate name=AddFooColumn
task migration:run
task migration:revert

# Docker
task docker-compose    # build+recreate full stack, --scale oasm-worker=3
```

Missing entries: `console:test:coverage`, `console:e2e`, `api:test:watch`, `api:test:cov` exist as package scripts but have **no** task entry — add one instead of calling the script.

## Database Migrations — HARD RULE

**Agents must not create migration files on their own initiative.** A migration file only exists when the user explicitly asked for the schema change *and* approved generating it.

1. **Ask first, then wait.** If your task implies a schema change — new/renamed/dropped column, new table, new index, changed column type, new entity — that is *not* implied permission. Stop, state exactly what the schema change would be, and get an explicit "yes, generate the migration" before creating anything. Silence is not approval.
2. **Never hand-write a migration.** Do not create, stub, or `write` any file under `core-api/src/database/migrations/`. Do not run `psql`/`CREATE TABLE`/raw DDL, do not run `typeorm migration:generate` (or any `typeorm` CLI call) directly, do not hand-craft SQL migration files "because it's faster". The taskfile owns the correct DataSource (`-d src/database/database-config.ts`), the `ts-node` + `tsconfig-paths/register` wiring, and the dotenv load — bypassing it produces a broken or unrunnable migration.
3. **Use the taskfile command, with the lowercase var.** From the repo root:
   ```bash
   task migration:generate name=AddFooColumn
   ```
   `name=` is canonical (`MIGRATION_NAME=` is still accepted as an alias). If you pass neither, the task now **fails with an explicit error** — an empty output path is no longer possible. Verify the resolved path without side effects using `task --dry migration:generate name=X`.
4. **Review the generated diff before committing.** TypeORM diffs entities against the last applied migration, so output often contains junk: spurious drops, re-typed columns, index churn from renamed constraints. Fixing `up`/`down` **inside the file you just generated** is the only permitted hand-editing of a migration.
5. **Never modify or reorder an already-applied migration.** Files are `<epoch-ms>-<Name>.ts` and are recorded in the `migrations` table; editing applied history desyncs local, CI, and prod. Add a new migration instead. New files always append at the end of the sequence.
6. **Apply only to a local database.** Before `task migration:run` / `task migration:revert`, confirm `core-api/.env` points at the local Postgres and say which DB you are about to mutate. Never run these against a shared/staging/production database.
7. **Why this is non-negotiable:** `dataSourceOptions` in `core-api/src/database/database-config.ts` sets `synchronize: false` — the schema *only* ever changes through migrations. A missing or bogus migration is a real runtime bug, and `migrationsRun: NODE_ENV === 'development'` means a dev boot silently applies whatever is in the folder, so a hand-written file gets executed without anyone reviewing it.

Migration location: `core-api/src/database/migrations/` (58 files, newest last). Docker path: the `migration` compose service runs `typeorm migration:run -d dist/database/database-config.js` from the built image and gates `core-api` startup on it.

## Local Dev Setup

1. `task init` — enables pnpm via corepack, copies `core-api/example.env` → `.env` and `console/example.env` → `.env` (only when missing), runs `pnpm install` + `task worker:install` (`go mod tidy`), and starts `postgres` + `redis` via compose.
2. `worker/.env` must be created by hand from `worker/.example.env` (`task init` does not copy it) — `WORKER_API_KEY` must match the key core-api expects.
3. `task dev` → API `:6276` (gRPC `:16276`, Swagger/Scalar at `/api/docs`), console `:5173`.
4. `task worker:dev` for a local worker. Worker **tools are not installed by any task** — the worker pulls them at runtime: `DownloadTools` (`worker/internal/grpcclient/tools.go`) calls the core-api `BuiltinToolRegistry` gRPC, downloads/extracts the archives into `WORKER_TOOL_PATH` (default `oasm-tools`; Docker backs it with the shared `worker-tools-cache` volume), and caches versions in `.tool_versions.json` there. So the first worker boot needs core-api **and** its storage reachable. There is no `task worker:tools` — that task does not exist, and `worker/scripts/install.{sh,ps1}` are release-binary installers for end users, not tool installers.

## Configuration Files & Linting

### core-api
- `eslint.config.mjs` — type-checked rules that actually fail the build: `no-console: error`, `@typescript-eslint/no-floating-promises: error`, `@typescript-eslint/no-misused-promises: error`, `consistent-type-imports: error`, `no-explicit-any: warn` (relaxed in tests).
- `tsconfig.json` — `@/` → `src/`; Jest `moduleNameMapper` mirrors it.
- `package.json` → `jest.transform` = `@swc/jest` (decorators + `decoratorMetadata`, target es5). **Do not** switch to `ts-jest` and **do not** drop `--maxWorkers` / `--workerIdleMemoryLimit` — both thrash RAM on this machine.
- Lint: `task api:lint` → `eslint "{src,apps,libs,test}/**/*.ts" --fix` (note: `--fix` mutates files).

### console
- `eslint.config.js` — react-hooks + react-refresh.
- `orval.config.ts` — reads the **patched** spec `.open-api/open-api.patched.json`, which it regenerates from `.open-api/open-api.json` on every run (patches the audit-export CSV response so the hook types as `Blob`). Any op with a `page` param is auto-switched to `useInfiniteQueryParam: 'page'`. Output: `src/services/apis/gen/queries.ts` (`clean: true`, axios + `orvalClient` mutator).
- `vite.config.ts` — `tanstackRouter()` generates `src/routeTree.gen.ts` from `src/routes/`. Never edit the generated tree; add/rename route files instead.
- Lint: `task console:lint` → `eslint .` (no `--fix`).

### worker
`task worker:format` (`go fmt`), `task worker:lint` (`go vet`), `task worker:check` (`go build ./...`). CI fails on any unformatted file.

## Environment Variables

| File | Key vars |
|---|---|
| `core-api/.env` (from `example.env`) | `POSTGRES_*`, `REDIS_URL`, `PORT=6276`, `GRPC_PORT=16276`, `GEO_IP_URL`, `OASM_CLOUD_APIKEY`, `ENCRYPTION_KEYS` (comma-separated KEKs, **last = active**), `RUSTFS_ENDPOINT/ACCESS_KEY/SECRET_KEY`, `AUDIT_ARCHIVE_DIR` |
| `console/.env` (from `example.env`) | `VITE_API_URL` (dev `http://localhost:6276`) |
| `worker/.env` (from `.example.env`) | `WORKER_API_KEY`, `WORKER_MAX_CONCURRENCY`, `WORKER_GRPC_HOST/PORT`, plus `WORKER_MODE`, `WORKER_TOOL_PATH`, `WORKER_TOKEN_FILE`, `WORKER_CONNECTOR_ADDR`, `WORKER_CONNECTOR_ADDR_ALLOW_AUTODETECT`, `WORKER_NETWORK` |

`ENCRYPTION_KEYS` semantics matter: the last key encrypts *and* decrypts, earlier keys are decrypt-only — reordering the list locks every encrypted column.

## Architecture Patterns

### core-api
- **Controller → Service → Repository/Entity**. Controllers do validation + mapping only.
- DTOs for every request/response (`class-validator` + `class-transformer`); Swagger decorators are required or orval generates unusable types.
- Entities in module folders or `src/common/entity/`; `dataSourceOptions.entities` globs `**/*.entity{.ts,.js}`.
- **User data responses expose only `id`, `name`, `image`** — enforce in services, not controllers.
- `@getWorkspaceId: true` on controllers that need tenant context; workspace scoping is not optional.
- gRPC server `:16276`, protos in `src/proto/`, Go stubs generated into `worker/internal/gen/` (there is **no** `grpc-client/` directory anymore — older docs are stale).
- BullMQ for async jobs; queue payloads are slim and tenant-scoped.
- MCP is an **in-process controller** (`src/mcp/mcp.controller.ts`, `GET /mcp` + `POST /mcp/message`, guarded by `McpGuard`) — not a separate server, no `ASSISTANT_HOST`/`SEARXNG_URL`.
- `main.ts` rewrites `../.open-api/open-api.json` from the live Swagger document on **every boot** — that is why `task gen-api` needs a freshly booted API.

### worker
- Go module `worker/`, business logic in `internal/{cli,config,connector,execution,runtime,grpcclient,hostmetrics,observability,resource,security,telemetry,transport,tui,worker}`.
- `cmd/cli` flags: `--mode cli|node`, `--api-key`, `--max-concurrency`, `--grpc-host`, `--grpc-port`, `--tool-path`, `--network`. `cmd/app` is the same thing driven purely by `WORKER_*` env.
- **Connector model:** the worker node is a *node* that dispatches work to connector containers over the Docker Engine API and serves their callback gRPC on `:26276`. It therefore needs the host Docker socket (docker-outside-of-docker, root-equivalent — trusted images only) and the socket's group (`group_add: ['0']` on Docker Desktop). It auto-adds the `host-gateway` extra-host on Linux so `host.docker.internal` resolves; `WORKER_CONNECTOR_ADDR_ALLOW_AUTODETECT=1` is a **dev-only** escape hatch (compose pins the address instead).
- Join identity is persisted at `WORKER_TOKEN_FILE` on the `worker-state` volume. Losing that file mints a new identity and startup orphan-reconcile can no longer recognise previously spawned containers.
- Connector catalogue comes from `core-api/resources/connectors/manifest.json`; refresh with `task sync-connectors` (set `MANIFEST_PATH=<local oasm-connectors checkout>/manifest.json` to preview an unmerged connector instead of pulling `main`).

### console
- `components/{ui,common,<feature>}/` for shared/primitive/feature components, `pages/<page>/components/` for page-local logic.
- API hooks are orval-generated TanStack Query hooks (`use<OperationId>`) with the custom axios mutator at `src/services/apis/axios-client.ts`.
- Routes are file-based under `src/routes/` (`_authed.tsx` = authenticated layout, `__root.tsx` = root).
- `no-console` equivalent is enforced by lint; skeletons/empty states are expected on every data card (recent commits standardised this).

## Testing

- **core-api**: Jest, `*.spec.ts` colocated, `rootDir: src`, `testRegex: .*\.spec\.ts$`. Mock every external dep (DB, Redis, queues, cloud SDKs). Run `task api:test`; single file `task api:test:one SPEC=<path>`; e2e `task api:test:e2e` (needs live postgres + redis).
- **console**: Vitest (`task console:test` = watch, `task console:test:run` = single pass) + Playwright e2e in `console/e2e/` (has `global-setup.ts`, `fixtures/`, `helpers/`). Root `task test` does **not** run console tests — `pnpm --filter console run test:run` + `test:coverage` is what CI actually executes.
- **worker**: `task worker:test`, plus `test-race` for anything touching concurrency, pools, or the Docker runtime.
- Note: `refactor(core-api)` history dropped the connector tests — do not assume a test suite exists for a module; check before claiming coverage.

## Git Hooks & CI

- Husky v9. `pre-commit` — **fully commented out**, nothing is enforced locally. `commit-msg` — Conventional Commits required: `feat|fix|hot-fix|perf|chore|docs|style|refactor|test|ci(<scope>):`, merges allowed.
- CI (`.github/workflows/`, all path-filtered): `check-lint` (core-api + console matrix), `check-test` (core-api only), `check-build`, `frontend-tests` (console, `main` only), `worker-ci` (go fmt check + vet + build cli/app), `build-release` / `build-nightly`. Toolchain: Node **22**, pnpm **10.33.2**, Go **1.26**.
- Since pre-commit is inert, **you** must run `task lint` and `task test` before declaring a change done.
- Local CI rehearsal: `bash .github/scripts/test-local.sh <workflow>` (needs Docker + `act`).

## Docker

`task docker-compose` = `docker compose --env-file ./core-api/.env up -d --build --force-recreate --scale oasm-worker=3`.

Services: `console` (`:3000`), `core-api` (`:6276` + `:16276`, healthcheck `/api/health`), `oasm-worker` ×3 (socket-mounted, `:26276` published), `postgres` (pg17+pgvector), `redis`, `geo-ip` (`:4360`), `rustfs` (`:9000`/`:9001`), and a one-shot `migration` service that gates `core-api` startup (`service_completed_successfully`).

The compose service key is `oasm-worker`, **not** `worker` — `--scale worker=3` fails with `no such service: worker: not found`. If you ever scale manually, use `docker compose up -d --scale oasm-worker=N`.

Volumes worth knowing: `pgdata`, `redis-data`, `geoip-data`, `rustfs-data`, `worker-tools-cache` (shared tool cache across workers), `worker-state` (worker join identity). `.open-api` is bind-mounted into `core-api` so the container regenerates the spec the console codegen consumes.

## Common Gotchas

0. **Never bypass the taskfile.** `npm run lint` / `pnpm run test` / `go test ./...` skip the RAM limits, worker caps, and transform config. Missing entry → add it to the taskfile.
1. **No unauthorized migrations.** See [Database Migrations](#database-migrations--hard-rule). Permission first, `task migration:generate name=<Name>` second, hand-writing never.
2. **`MIGRATION_NAME=` is a legacy alias** — `task migration:generate` wants `name=`; both work, neither is required-and-unchecked any more (missing name = hard error).
3. **API contract change → `task gen-api`**, then commit **both** the regenerated `.open-api/*.json` spec *and* `console/src/services/apis/gen/queries.ts`. The API must be running (the spec is rewritten on every boot).
4. **Proto change → `task proto`**; output is `worker/internal/gen/**`, and there is no `grpc-client/` dir.
5. **Console tests are not in `task test`.** Use `task console:test:run` (CI parity) — and note `task console:test` alone is watch mode and will hang.
6. **Generated code is read-only**: `console/src/services/apis/gen/`, `console/src/routeTree.gen.ts`, `worker/internal/gen/`, `.open-api/*`, `core-api/resources/connectors/manifest.json`.
7. **`.open-api/` is generated *and* git-tracked** (it is **not** gitignored, contrary to older docs). core-api rewrites `open-api.json` on every boot, so it shows up as a modified file after any API start — that is expected. When the contract changes, commit the spec together with the regenerated console client.
8. **Lint autofixes.** `task api:lint` runs with `--fix`; re-read files after linting instead of assuming your version survived.
9. **`ENCRYPTION_KEYS` is order-sensitive** — the last key is the only one that encrypts.
10. **`task lint` is sequential by design** (two type-aware ESLint processes exhaust RAM). Never run `api:lint` and `console:lint` in parallel/background.
11. **RustFS/S3 (`RUSTFS_*`) is not optional** — it backs storage, PDF reports, *and* the worker tool registry (`BuiltinToolRegistry` serves the tool archives). Compose only waits for `rustfs` to be *started*, not healthy, so a slow first boot can fail the first worker tool download.
12. **The worker needs the Docker socket**; without the right group id the daemon returns "permission denied" and API-version negotiation silently falls back to 1.24.
13. **CI is Node 22 / pnpm 10.33.2 / Go 1.26** — mismatched local versions produce failures that look like code bugs.
