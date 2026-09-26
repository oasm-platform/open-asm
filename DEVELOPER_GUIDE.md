# Developer Guide for Open Attack Surface Management (OASM)

This guide provides detailed instructions for setting up your local development environment, running the services, and contributing to the OASM project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Initialize Developer Environment](#initialize-developer-environment)
- [Running Services](#running-services)
  - [Core API](#core-api)
  - [Console (Web Interface)](#console-web-interface)
  - [Workers](#workers)
  - [All Services with Task](#all-services-with-task)
- [Database Setup](#database-setup)
- [Database Migration](#database-migration)
- [Development Conventions](#development-conventions)
  - [Code Style](#code-style)
  - [Testing](#testing)
  - [API Client Generation](#api-client-generation)
  - [gRPC Stub Generation](#grpc-stub-generation)
  - [Connector Catalog Sync](#connector-catalog-sync)
- [Using Docker Compose](#using-docker-compose)
- [Local CI Testing](#local-ci-testing)
- [Contributing](#contributing)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Task (taskfile)** - [Installation Guide](https://taskfile.dev/#/installation)
- **Node.js v22+** - [Installation Guide](https://nodejs.org/en/download/package-manager)
- **pnpm 10.33.2** - `task init` installs/enables it via corepack; the repo is a pnpm workspace, not npm
- **Go 1.26+** - [Installation Guide](https://go.dev/doc/install)
- **PostgreSQL v17+** (with pgvector extension)
- **Docker & Docker Compose** (recommended for database and full stack)

> **Always run project commands through `task` from the repository root.**
> The taskfiles carry the settings that raw scripts bypass — `task lint` runs ESLint
> sequentially (two type-aware processes at once exhaust RAM), `task test` applies
> `--maxWorkers=50% --workerIdleMemoryLimit=512MB` plus the SWC transform, and
> `task dev`/`task prod` set `NODE_ENV`. `npm run`, `pnpm run`, `npx <bin>` and raw
> `go test` are not supported entry points. If a command you need has no task entry,
> add one to the taskfile instead of calling the package script.

## Project Structure

The project is organized into several key directories:

```
open-asm/
├── core-api/           # NestJS API server
│   ├── src/            # Source code
│   │   ├── database/   # DataSource config + TypeORM migrations
│   │   ├── modules/    # Feature modules (assets, jobs-registry, workers, ...)
│   │   ├── mcp/        # MCP endpoint (in-process controller)
│   │   └── proto/      # gRPC service definitions
│   ├── example.env     # Environment template
│   ├── taskfile.yml    # api:* tasks
│   └── package.json
├── console/            # React web interface
│   ├── src/            # React components, file-based routes, generated API client
│   ├── e2e/            # Playwright end-to-end tests
│   ├── public/         # Static assets
│   ├── example.env     # Environment template
│   ├── taskfile.yml    # console:* tasks
│   └── package.json
├── worker/             # Go-based scanning worker
│   ├── cmd/            # CLI and App entry points
│   ├── internal/       # Business logic (incl. gen/ = generated gRPC stubs)
│   ├── scripts/        # Release-binary installers for end users (install.ps1, install.sh)
│   ├── go.mod          # Go module definition
│   ├── taskfile.yml    # worker:* tasks
│   └── .example.env    # Environment template
├── .open-api/          # OpenAPI spec — GENERATED, but tracked in git (commit it with contract changes)
├── docker-compose.yml  # Container orchestration
├── taskfile.yml        # Root task automation (includes the three sub-taskfiles)
└── README.md           # Documentation
```

## Initialize Developer Environment

To set up your local development environment, run the following command:

```bash
task init
```

This command will:

- Enable/install pnpm via corepack.
- Copy `core-api/example.env` → `core-api/.env` and `console/example.env` → `console/.env` (only when the target file is missing).
- Install Node dependencies with `pnpm install` and Go dependencies with `go mod tidy`.
- Start the `postgres` and `redis` containers via Docker Compose.

It does **not** create `worker/.env` — copy `worker/.example.env` to `worker/.env` manually and set `WORKER_API_KEY` to the key core-api expects.

Worker scanning tools (nuclei, subfinder, httpx, naabu, dnsx) are **not** installed by any task. The worker downloads them at runtime from the core-api `BuiltinToolRegistry` gRPC into `WORKER_TOOL_PATH` (default `oasm-tools`), caching versions in `.tool_versions.json` there. In Docker, that directory is the shared `worker-tools-cache` volume.

After running `task init`, you can start all services using `task dev` or run them individually as described below.

## Running Services

### All Services with Task

To start the API and Console development servers simultaneously:

```bash
task dev
```

This starts:
- Core API at `http://localhost:6276`
- Console at `http://localhost:5173` (Vite dev server)

### Core API

```bash
task api:dev
```

The API runs on port `6276` with gRPC server on port `16276` and API docs at `/api/docs`.

### Console (Web Interface)

```bash
task console:dev
```

### Workers

The worker runs as a *node*: it picks up jobs from core-api over gRPC, then
spawns connector containers through the Docker Engine API. Running it locally
therefore requires a reachable Docker daemon.

To run the worker locally (CLI binary, node mode, connector auto-detect allowed):

```bash
task worker:dev
```

With custom parameters:

```bash
task worker:dev replicas=3 maxJobs=10 apiKey=<your-api-key> network=<target-network>
```

To run workers in app mode (env-driven, the variant used by the Docker image):

```bash
task worker:dev-app
```

On first run the worker downloads its scanning tools from core-api into
`WORKER_TOOL_PATH` (default `oasm-tools`), so core-api and its object storage
must be reachable.

## Database Setup

`task init` already starts the `postgres` and `redis` containers. If you need to
(re)start them later:

```bash
docker compose up postgres redis -d
```

You can also use your own PostgreSQL/Redis instances — update `core-api/.env`
accordingly. The database uses PostgreSQL 17 with the pgvector extension for
vector operations.

## Database Migration

This section explains how to manage database migrations using the taskfile.

### Overview

Database migrations are managed using TypeORM. The migration commands live in
`core-api/taskfile.yml` and are exposed at the repo root as `task migration:*`.

> **Rules for schema changes**
>
> 1. **Never hand-write a migration file.** Do not create, stub, or edit files in
>    `core-api/src/database/migrations/` by hand, and do not apply DDL through
>    `psql` or any other client. Always generate through the taskfile below — it
>    owns the correct DataSource, the `ts-node` + `tsconfig-paths` wiring, and the
>    dotenv load, all of which a hand-run command gets wrong.
> 2. **Never invoke the TypeORM CLI directly** (`pnpm exec typeorm ...`,
>    `node_modules/typeorm/cli.js`, `npx typeorm ...`). Use `task migration:*`.
> 3. **The variable is lowercase `name`.** `MIGRATION_NAME=` is still accepted as
>    an alias, but `name=` is canonical. If you pass neither, the task now fails
>    with an explicit error instead of generating into an empty path.
> 4. **Review the generated `up`/`down` before committing.** TypeORM diffs your
>    entities against the last applied migration, so the output often contains
>    spurious drops, re-typed columns, and index churn. Fixing the file you just
>    generated is expected — rewriting migration history is not.
> 5. **Never edit or reorder an already-applied migration.** Applied rows are
>    recorded in the `migrations` table; changing history desyncs every
>    environment. Add a new migration instead.
> 6. **Only run against a local database.** Confirm `core-api/.env` points at
>    your local Postgres before `migration:run` / `migration:revert`.

Migrations only run when they are asked for — `synchronize` is `false` in
`core-api/src/database/database-config.ts`, so the schema changes *exclusively*
through these files. Note that `migrationsRun` is enabled when
`NODE_ENV=development`, meaning a development boot will apply anything present in
the migrations folder; another reason not to drop unreviewed files in there.

### Running Migrations

#### Run all pending migrations

This command executes all pending database migrations:

```bash
task migration:run
```

This will:

- Connect to the PostgreSQL database
- Check for pending migrations in the `migrations` table
- Run all new migrations that haven't been applied yet

#### Generate a new migration

To generate a new migration with a custom name:

```bash
task migration:generate name=YourMigrationName
```

For example:

```bash
task migration:generate name=AddUserTable
```

This will create a new timestamped file (`<epoch-ms>-AddUserTable.ts`) in
`core-api/src/database/migrations/`. Always read the generated SQL before
committing it.

#### Revert the last migration

To rollback the most recently executed migration:

```bash
task migration:revert
```

**Note:** This will only revert one migration at a time. Repeat if needed.

### Using Docker Compose for Migrations

If you prefer to run migrations using Docker (useful when not running PostgreSQL locally):

```bash
docker compose up migration
```

This will:

1. Start the PostgreSQL container and wait for it to become healthy
2. Run the one-shot `migration` service, which executes all pending migrations
3. Stop that container when it finishes (`restart: 'no'`)

It starts only the `migration` service and its `postgres` dependency — it does
**not** start `core-api`. Use `task docker-compose` if you want the whole stack
with migrations applied first.

### Migration with Docker - Manual Run

To run the migration container manually and keep it for debugging:

```bash
docker compose run --rm migration
```

The `--rm` flag ensures the container is removed after it stops.

## Development Conventions

### Code Style

- **Core API (NestJS):** Uses ESLint and Prettier for code formatting and linting.
  ```bash
  task api:lint
  ```
- **Console (React):** Uses ESLint and Prettier.
  ```bash
  task console:lint
  ```
- **Workers (Go):** Uses `go fmt` and `go vet`.
  ```bash
  task worker:format
  task worker:lint
  ```

### Testing

- **Core API:** Uses Jest for testing.
  ```bash
  task api:test                                          # Unit tests
  task api:test:one SPEC=src/modules/storage/storage.service.spec.ts   # Single file
  task api:test:e2e                                      # End-to-end (needs postgres + redis)
  ```
  Watch mode and coverage exist as package scripts but have no task entry — add
  one to `core-api/taskfile.yml` rather than invoking the script directly.

- **Console:** Uses Vitest for unit tests and Playwright for e2e tests.
  ```bash
  task console:test        # Unit tests (watch mode)
  task console:test:run    # Unit tests, single pass (what CI runs)
  ```
  `console:test:run` is the CI equivalent; `task console:test` alone stays in
  watch mode. E2E specs live in `console/e2e/` and have no task entry yet.

- **Workers:** Uses Go testing.
  ```bash
  task worker:test
  task worker:test-race   # Race detector — use for concurrency/pooling changes
  task worker:check       # go build ./... compile check
  ```

> The Husky `pre-commit` hook is fully commented out, so nothing runs
> automatically on commit. Run `task lint` and `task test` yourself before
> pushing. `task lint` is intentionally sequential (API then console) — never
> run the two linters in parallel.

### API Client Generation

After making changes to the API contract, regenerate the console API client:

```bash
task gen-api
```

This uses orval to generate TanStack Query hooks from the OpenAPI spec. The spec
itself (`.open-api/open-api.json`) is rewritten by core-api on **every boot**, so
start the API before running this.

`.open-api/` is generated but **tracked in git** — when you change the API
contract, commit the regenerated spec together with
`console/src/services/apis/gen/queries.ts`.

Never edit `console/src/services/apis/gen/` or `console/src/routeTree.gen.ts`
by hand; change the source and re-run the generator.

### gRPC Stub Generation

After modifying proto files in `core-api/src/proto/`, regenerate the Go stubs:

```bash
task proto
```

This installs the `protoc-gen-go` / `protoc-gen-go-grpc` plugins and writes Go
stubs into `worker/internal/gen/`.

### Connector Catalog Sync

Scanning connectors are versioned Docker images maintained in the separate
[oasm-connectors](https://github.com/oasm-platform/oasm-connectors) repository.
Refresh the local copy of the catalog with:

```bash
task sync-connectors
```

This writes `core-api/resources/connectors/manifest.json`, which core-api reads
to resolve connector images and input schemas. Set
`MANIFEST_PATH=<path>/manifest.json` to sync from a local `oasm-connectors`
checkout instead of the `main` branch.

## Using Docker Compose

To run the entire stack using Docker Compose:

```bash
task docker-compose
```

This starts:
- Console (port 3000)
- Core API (port 6276, gRPC port 16276)
- 3 Worker instances
- PostgreSQL with pgvector (port 5432)
- Redis (port 6379)
- Geo-IP proxy (port 4360)
- RustFS S3-compatible storage (port 9000, admin UI 9001)

Notes:
- The compose service key is `oasm-worker` (not `worker`); the root taskfile
  passes `--scale oasm-worker=3`. Scaling a non-existent service name fails with
  `no such service: worker: not found`.
- The worker needs the host Docker socket (it spawns connector containers via
  the Docker Engine API). That socket is root-equivalent on the host — only run
  trusted connector images.
- The one-shot `migration` service runs pending migrations and gates `core-api`
  startup, so the API never serves against an out-of-date schema.

## Local CI Testing

Before pushing changes, you can run GitHub Actions workflows locally using [act](https://github.com/nektos/act) to catch issues early.

### Prerequisites

- Docker Desktop must be installed and running
- Install act:
  ```bash
  # Linux/macOS
  curl -fsSL https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

  # Windows (Git Bash)
  curl -fsSL https://raw.githubusercontent.com/nektos/act/master/install.sh | bash
  mv act_Windows_x86_64.zip /tmp/act/act.exe
  ```

### Usage

```bash
# List available workflows
bash .github/scripts/test-local.sh

# Run a specific workflow
bash .github/scripts/test-local.sh check-lint
bash .github/scripts/test-local.sh worker-ci

# Validate all workflows (dry-run)
bash .github/scripts/test-local.sh --all

# Custom act binary path
ACT_BIN=act bash .github/scripts/test-local.sh check-lint
```

### Local Test Equivalents

Some workflows can be tested faster by running the tasks directly:

| CI Workflow | Local Command |
|---|---|
| `check-lint.yml` | `task lint` |
| `check-test.yml` | `task api:test` |
| `check-build.yml` | `task build` (requires Docker) |
| `frontend-tests.yml` | `task console:test:run` |
| `worker-ci.yml` | `task worker:format && task worker:lint && task worker:check` |

CI toolchain, for reference: Node.js 22, pnpm 10.33.2, Go 1.26.

### Notes

- Workflows using `docker/build-push-action` with multi-platform builds (`build-release.yml`, `build-nightly.yml`) cannot be fully tested locally — they require QEMU and native CI runners.
- `dorny/paths-filter` may not detect file changes correctly in shallow clones. Use `--full-history` or test specific jobs.
- Docker layer caching (`type=gha`) is not available locally, but builds will still work.

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Make your changes and commit them following [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m 'feat(scope): add amazing feature'
   ```
   The `commit-msg` hook enforces the `type(scope): description` format
   (`feat`, `fix`, `hot-fix`, `perf`, `chore`, `docs`, `style`, `refactor`,
   `test`, `ci`). The `pre-commit` hook runs nothing, so verify yourself:

   ```bash
   task lint
   task test
   ```

   If your change touches the API contract, also run `task gen-api` and commit
   the regenerated `.open-api/` spec and console API client. If it touches
   `core-api/src/proto/`, run `task proto`. If it changes the schema, use
   `task migration:generate name=<Name>` — never hand-write a migration.
4. Test CI workflows locally: `bash .github/scripts/test-local.sh <workflow>`
5. Push to the branch: `git push origin feature/amazing-feature`.
6. Open a Pull Request.

Please ensure your code adheres to the project's coding standards and passes all tests before submitting a PR.
