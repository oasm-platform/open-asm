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
- [Presigned Direct Storage Access](#presigned-direct-storage-access)
  - [Flow](#flow)
  - [Public-read vs presigned](#public-read-vs-presigned)
  - [Why there are two S3 clients](#why-there-are-two-s3-clients)
  - [Browser PUT requirements](#browser-put-requirements)
  - [nginx public prefixes and presigned pass-through](#nginx-public-prefixes-and-presigned-pass-through-self-hosted-only)
  - [Switching to real S3](#switching-to-real-s3-configuration-only)
  - [Read authorization on presign/download](#read-authorization-on-presigndownload)
  - [Deferred and still open](#deferred-and-still-open)
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

## Presigned Direct Storage Access

Object-storage bytes never stream through core-api. The console asks
core-api for a URL via `getClientUrlForPath`
(`core-api/src/modules/storage/storage.service.ts`), then talks to S3 / RustFS
directly, so upload and download traffic bypasses the API process.

### Flow

1. The console calls a presign endpoint on core-api
   (`core-api/src/modules/storage/storage.controller.ts`), or reads a `url`
   field (logo, screenshot, icon) the API already resolved.
2. core-api validates bucket and key, then returns either a plain public URL
   or a short-lived SigV4 presigned URL (see Public-read vs presigned below).
3. The console `fetch`es that URL via `console/src/services/storage.ts`:
   `PUT` for uploads, plain `GET` for downloads. Render paths use the value
   verbatim via `resolveClientUrl` (`console/src/utils/storage-url.ts`).
4. The browser talks to object storage, not to core-api.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/storage/presign/upload` | POST | Presigned `PUT` into any non-private bucket. `@Roles(Role.ADMIN)`. |
| `/api/storage/presign/download` | GET | Presigned `GET`; optional `fileName` becomes `Content-Disposition`. Gated by `authorizeRead` (see Read authorization below), so a URL for another workspace's screenshot or template is refused with 403 before signing. |
| `/api/storage/logo/presign` | POST | Presigned `PUT` for the app logo: `system` bucket, `logo-` prefix, image extensions only. `@Roles(Role.ADMIN)`. |
| `/api/storage/logo/confirm` | POST | `HeadObject` on the uploaded key, validates content type and size, then activates the logo. `@Roles(Role.ADMIN)`. |
| `/api/templates/:templateId/presign` | POST | Presigned `PUT` for a template YAML. Requires workspace permission `template.write`. |

Buckets come from `StorageService.buckets`; `privateBuckets = ['reports',
'job-results']` are rejected by every presign endpoint.

`logo/confirm` is the only server-side check in the flow. It heads the object
and rejects non-images and anything above `LOGO_MAX_SIZE_BYTES` (5 MB,
`storage.controller.ts:37`), and it runs *after* the bytes are already in
storage.

### Public-read vs presigned

`getClientUrlForPath` (`storage.service.ts:535`) splits every read into two
cases. No client URL is ever persisted: the DB holds the raw `bucket/key`
(`screenshot/screenshot/...` in `asset_services.screenshotPath`,
`system/<file>` in the system-config row, `<templateId>.yaml` for templates),
and Redis holds the raw `cached-static/...` path under `icon:v2:` /
`technology:` keys. The URL is derived per response and thrown away.

- **Public-read.** Buckets in `PUBLIC_READ_BUCKETS` (`storage.service.ts:38`):
  `system`, `cached-static`. When the boot policy flag for that bucket is set
  (see below), the helper returns a plain, unsigned URL built from
  `S3_PUBLIC_ENDPOINT` (`storageConfig.publicEndpoint`), path-style
  `${endpoint}/${bucket}/${key}` when `S3_FORCE_PATH_STYLE` is true, else
  virtual-hosted `${scheme}://${bucket}.${host}/${key}` split via `new URL()`.
  `expiresIn` is `null`. The MIME type is derived from the key extension via
  `resolveMimeType` (`storage.service.ts:525`) and passed as
  `ResponseContentType` only on the presigned path.
- **Presigned fallback.** Anything else (tenant/private buckets, or a public
  bucket whose flag is off) returns `getPresignedDownloadUrl`
  (`storage.service.ts:480`): a SigV4 `GET` with derived
  `ResponseContentType`, optional `ResponseContentDisposition`
  (`attachment; filename="..."` when `fileName` was passed), TTL clamped from
  `S3_PRESIGN_TTL` to 60 s ... 604800 s.

The flag (`publicReadApplied`, `storage.service.ts:102`) is set per bucket at
boot by `applyPublicReadPolicy` (`storage.service.ts:207`), gated on proof:

1. Best-effort `PutPublicAccessBlock` with all four flags `false` (a
   `NotImplemented` from RustFS is swallowed with `Logger.debug` and never
   disables the feature).
2. `PutBucketPolicy` granting **Get-only** `s3:GetObject` on
   `arn:aws:s3:::<bucket>/*` to `Principal: "*"` (never Put/Delete/List).
3. Verification via `GetBucketPolicyStatus`: the flag is added **only** after
   the bucket reports `IsPublic`. Any failure logs `Logger.warn` and the flag
   stays off, so reads presign instead. Boot never crashes.

Required IAM: `s3:PutBucketPolicy` (+ `s3:PutBucketPublicAccessBlock` when the
account enforces Block Public Access).

Consumers: system-configs `getConfig` resolves the raw logo path to `{ url }`
(`core-api/src/modules/system-configs/system-configs.service.ts:49`) and
deletes by the raw path from `getRawLogoPath`, never by splitting a signed
URL; assets list/detail resolve `screenshotPath` the same way
(`core-api/src/modules/assets/assets.service.ts:354,495`); the
technology-forwarder caches the raw `cached-static/...` path under `icon:v2:`
and emits the resolved `iconUrl`
(`core-api/src/modules/technology/technology-forwarder.service.ts:577,593`).
The login page reads the presign TTL from
`GetMetadataDto.storagePresignTtlSeconds`
(`core-api/src/modules/root/dto/root.dto.ts:36`, served by
`core-api/src/modules/root/root.service.ts:82`) and the console bounds its
signed-screenshot query cache with `deriveScreenshotStaleTime`
(`min(60s, ttl * 0.8)`); public `logoPath`/`iconUrl` queries are
deliberately uncached by TTL.

### Why there are two S3 clients

`core-api/src/modules/storage/rustfs.client.ts` builds two `S3Client` instances:

| Accessor | Endpoint | Used for |
| --- | --- | --- |
| `getClient()` | `RUSTFS_ENDPOINT` (default `http://localhost:9000`) | Internal server-side work: bucket creation, `PutBucketCors`, tool archives, worker reads. |
| `getPresignClient()` | `S3_PUBLIC_ENDPOINT`, falling back to `RUSTFS_ENDPOINT` | Signing URLs that a browser will call. |

`S3_REGION` and `S3_FORCE_PATH_STYLE` apply to **both** clients — they are read
once in `parseStorageConfig` and handed to each. Only the endpoint differs. The
internal client is still forbidden from using `S3_PUBLIC_ENDPOINT`. Credentials
for both clients are the canonical `S3_ACCESS_KEY`/`S3_SECRET_KEY` pair;
`RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY` survive only as deprecated aliases
(see Renamed env vars below).

Read this before touching either one. SigV4 signs the `host` header and the
request path. A URL signed against `localhost:9000` is rejected by a browser
reaching `https://app.example.com`, because the signed host no longer matches
the one presented. One client cannot serve both roles, hence two.

The clients differ in a second, less obvious way: `getClient()` is built with
`checksum: false`, `getPresignClient()` with `checksum: true`, which expands to
`requestChecksumCalculation: 'WHEN_REQUIRED'` and
`responseChecksumValidation: 'WHEN_REQUIRED'`. The SDK default is
`WHEN_SUPPORTED`, which appends `x-amz-checksum-*` query parameters that the
signature was not computed over, so a presigned browser `PUT` fails with
`SignatureDoesNotMatch`. Do not "restore" the defaults.

### Relative vs absolute browser URLs (`STORAGE_URL_BASE`)

`STORAGE_URL_BASE` (`storage.config.ts`) selects how browser-facing storage URLs
are shaped; `StorageService.toBrowserUrl` and the public-read branch of
`getClientUrlForPath` apply it.

- **Empty (absolute mode, cloud).** Unchanged historic behavior: presigned URLs
  point at `S3_PUBLIC_ENDPOINT` and the plain public URL is built from it. Cloud
  sets `S3_PUBLIC_ENDPOINT` + `S3_FORCE_PATH_STYLE` and leaves this empty. The
  presign client signs against `publicEndpoint` with the configured addressing.
- **Non-empty, e.g. `/api/storage` (relative mode, dev/docker).** Browser URLs
  are same-origin: public buckets -> `${STORAGE_URL_BASE}/<bucket>/<key>`
  (no query, no signature, path-style regardless of `S3_FORCE_PATH_STYLE`);
  tenant/private buckets -> `${STORAGE_URL_BASE}/<bucket>/<key>?<X-Amz-...>`,
  where the signature is produced against `RUSTFS_ENDPOINT` with path-style
  addressing so the SigV4 `host` equals the `RUSTFS_ENDPOINT` host (dev
  `localhost:9000`, docker `rustfs:9000`).

The proxy (nginx or the Vite dev proxy) sits in front of core-api for the
prefix: it MUST strip the `STORAGE_URL_BASE` prefix before forwarding to
`RUSTFS_ENDPOINT`, and MUST preserve the original `Host` so it equals the
`RUSTFS_ENDPOINT` host the request was signed for. A wrong host or a rewritten
path is a `SignatureDoesNotMatch` 403 on every upload and download.

### Browser PUT requirements

- **Send the exact signed `Content-Type`.** When a content type was signed,
  `getPresignedUploadUrl` passes `signableHeaders: new Set(['content-type'])`
  (`storage.service.ts:474`). Any drift, including a browser default, is a 403
  `SignatureDoesNotMatch`. `console/src/services/storage.ts` is the single place
  that echoes the header, and callers must pass through the `contentType` the
  presign response returned.
- **Use plain `fetch`, not the shared axios client.** A presigned URL is
  absolute (its own baseURL must not be prefixed) and the signature covers the
  exact request; the axios instance would attach auth headers, cookies and
  param serialisation and perturb the signature into a 403.

### nginx public prefixes and presigned pass-through (self-hosted only)

In the Docker deployment the browser hits the console origin, so
`console/nginx.conf` serves both plain public reads and signed requests:

- **Unsigned public prefixes.** `location ^~ /system/` and
  `location ^~ /cached-static/` (`console/nginx.conf:47,56`) proxy plain
  `GET`s straight to `http://object_storage` (rustfs:9000) with
  `Host $http_host` (not `$host`). The buckets behind them are Get-only
  public via the boot policy above, so no signature is needed.
  `^~` beats the static-asset extension regex below, so `/system/*.webp`
  lands here instead of 404ing into `index.html`.
- `map $args $is_presigned` matches `(^|&)X-Amz-Signature=`. nginx cannot build
  a variable name containing hyphens (`$arg_X-Amz-Signature` parses as
  `$arg_X` plus literal text and is always truthy), so the query string is
  matched instead.
- The signed request leaves through `error_page 418 = @object_storage`, so the
  rewrite phase runs before `try_files`.
- The `/`, `/system/`, `/cached-static/`, and static-asset locations each
  `return 418` when `$is_presigned`, so a presigned key keeps server-level
  418 routing instead of being answered as a static file or marked public.
  **No `error_page` inside the new `^~` locations**: a location-level
  `error_page` shadows the server-level `error_page 418 = @object_storage`
  and breaks presigned fallback with a bare 418. No
  `proxy_intercept_errors`, so a missing key returns the real upstream 404,
  and `add_header` without `always` applies to 2xx/3xx only, so errors are
  never marked public.
- Inside `@object_storage` the path must **not** be rewritten (SigV4 signs the
  path), and `Host` is forwarded as `$http_host`, not `$host`: the signature
  covers `host:port` and `$host` strips the port.
- Adding a `/s3/` prefix, or any other path rewrite, produces
  `SignatureDoesNotMatch` on every upload and download.

### Switching to real S3 (configuration only)

No code change. Profiles live in `core-api/example.env:42-73` and the
compose overrides in `docker-compose.yml:43-61`. Set in `core-api/.env`:

| Variable | Value |
| --- | --- |
| `RUSTFS_ENDPOINT` | Endpoint the **API** reaches (e.g. the in-network or VPC endpoint). Required in the cloud — it is the internal ops endpoint, and it is deliberately never read from `S3_PUBLIC_ENDPOINT`. |
| `S3_PUBLIC_ENDPOINT` | **Profile A (self-hosted, same-origin nginx proxy):** must equal the console origin (compose sets `http://localhost:3000` in `docker-compose.yml:57`), or the unsigned `location ^~ /system/` and `location ^~ /cached-static/` prefixes in `console/nginx.conf` are bypassed and plain public GETs fall through to the SPA. **Profile B (cloud, AWS S3):** `https://s3.<region>.amazonaws.com`, so signed URLs are virtual-hosted (`https://<bucket>.s3.<region>.amazonaws.com/<key>`). |
| `S3_REGION` | The bucket's region. Signs **both** clients — the internal client is not pinned to `us-east-1`. |
| `S3_FORCE_PATH_STYLE` | `true` for RustFS/MinIO (Profile A), `false` for AWS S3 (Profile B). Applies to **both** clients, including the plain-URL builder. Ignored for public-read plain URLs when `STORAGE_URL_BASE` is set. |
| `STORAGE_URL_BASE` | Empty (default in cloud) => absolute URLs. Set (e.g. `/api/storage`, dev/docker) => same-origin relative URLs; the proxy must strip the prefix and forward `Host` == `RUSTFS_ENDPOINT` host (see Relative vs absolute browser URLs). |
| `S3_USE_DEFAULT_CREDENTIALS` | `true` for IAM roles / instance profiles; otherwise leave `false` and set `S3_ACCESS_KEY` + `S3_SECRET_KEY` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated console origins. Single origin source: also drives API CORS and better-auth trusted origins (see Renamed env vars below). Cross-origin direct fetches of public objects need their origin listed here |

`StorageService.onModuleInit` applies the CORS rule to every bucket on boot
(`GET, PUT, POST, HEAD`, `AllowedHeaders: *`, exposes `ETag`), and skips it
entirely when the origins list is empty.

The nginx public prefixes above are self-hosted, same-origin storage
only. For Profile B (cloud) the operator must additionally disable S3 Block
Public Access on the public buckets (`system`, `cached-static`), or the app
applies `PutPublicAccessBlock` itself at boot (best-effort); AWS S3 rejects
an arbitrary `Host`, so a cloud deployment drops the proxy and relies on the
direct endpoint plus that bucket CORS.

Defaults, clamping and parsing for every variable above live in
`core-api/src/modules/storage/storage.config.ts`. `S3_PRESIGN_TTL` defaults to
900 s and is clamped to 60 s ... 604800 s. Treat that file as the source of
truth, not this section.

#### Renamed env vars

| Canonical (set this) | Deprecated alias (still read, one release) | Removal |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGINS` | `S3_CORS_ALLOWED_ORIGINS` | Alias removed in the next release after this consolidation; set the canonical name now |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` (pair only, never mixed) | Alias pair removed in the next release; the vendor names remain only where compose injects them into the RustFS container and the nginx signer |

When both names are set, the canonical one wins and the alias logs a one-time
deprecation warning.

### Read authorization on `presign/download`

There is no byte-streaming read route: object bytes are served only by
storage itself (plain public URL or presigned URL). The only read gate is
`presign/download` (`storage.controller.ts:210`), which keeps authorization
via `authorizeRead` (`storage.controller.ts:233`) over the bucket classes
from `StorageService.getBucketAccess` (`storage.service.ts:104`). This is
the AE-02 posture: finding AE-02 in
[`docs/security-audit-report.md`](docs/security-audit-report.md) is closed
by this model.

| Class | Buckets | Rule |
| --- | --- | --- |
| `public` | `system` | Allowed without a session (login page renders the logo anonymously). |
| `authenticated` | `cached-static` | Any session allowed; anonymous gets 401. |
| `tenant` | `screenshot`, `nuclei-templates` | Anonymous gets 401; ownership resolved via `resolveObjectWorkspaceIds` (`storage.service.ts:297`), membership of ANY owning workspace required, otherwise 403; unknown keys return 404 so the endpoint is not a workspace-existence oracle. |
| `private` | `reports`, `job-results` | Never signed: 403 via `assertBucketNotPrivate` before auth. |
| `blocked` | `default` and anything unknown | 404 as if the object did not exist. |

Status semantics: 401 means no session on an `authenticated`/`tenant` bucket;
403 means a session without membership (or a `private` bucket); 404 means
`blocked`, or a tenant key with no owner row. `presign/download` applies
`assertBucketAllowed` (400) and `assertBucketNotPrivate` (403) first, so its
guard order is 400, 403, then 401/403/404 from `authorizeRead`.

Note the split between the two public-ish classes: `PUBLIC_READ_BUCKETS`
(`storage.service.ts:38`) covers both `system` and `cached-static` for the
boot bucket policy and plain URLs, while `getBucketAccess` keeps `system`
`public` (anonymous signing allowed) and `cached-static` `authenticated`
(session required to mint even a signed URL).

This deliberately deviates from the audit allow-list, which recommended
`system`, `nuclei-templates` and `cached-static` as public. The console sits
behind auth, so no anonymous consumer needs those two buckets:
`cached-static` is session-gated and `nuclei-templates` is tenant-gated with
no anonymous path lost.

Residual risk: screenshot keys are `md5(asset.value)`
(`core-api/src/modules/data-adapter/data-adapter.service.ts:641`), a flat key with no workspace prefix, so two
workspaces scanning the same hostname share one key. md5 is not collision
resistant, so a crafted value could alias another tenant's key; the mitigation
is that authorization checks membership of ANY owning workspace
(`resolveObjectWorkspaceIds` returns every distinct owner, never one
arbitrary row), and finding or guessing a key still requires a session in at
least one owning workspace. `nuclei-templates` keys are `<templateId>.yaml`
and resolve by exact template id, so no cross-workspace aliasing there.

### Deferred and still open

- **No server-side max size on a presigned `PUT`.** A signed `PUT` is accepted
  by the storage backend for whatever body the client sends. The only cap in the
  self-hosted deployment is `client_max_body_size 100m` in
  `console/nginx.conf`. Enforce a real limit at the storage layer.
- **Deliberately absent:** presigned POST, CloudFront signing, multipart and
  resumable uploads. They do not exist.

## Using Docker Compose

To run the entire stack using Docker Compose:

```bash
task docker-compose
```

This starts:
- Console (port 3000)
- Core API (port 6276, gRPC port 16276)
- A single worker instance (fixed connector port 26276 admits one worker per host)
- PostgreSQL with pgvector (port 5432)
- Redis (port 6379)
- Geo-IP proxy (port 4360)
- RustFS S3-compatible storage (port 9000, admin UI 9001)

Notes:
- The compose service key is `oasm-worker` (not `worker`). Do not scale this
  service: it publishes the fixed connector port `26276` that spawned connector
  containers dial back on, so a second replica fails with
  `Bind for 0.0.0.0:26276 failed: port is already allocated`.
- The worker needs the host Docker socket (it spawns connector containers via
  the Docker Engine API). That socket is root-equivalent on the host — only run
  trusted connector images.
- The one-shot `migration` service runs pending migrations and gates `core-api`
  startup, so the API never serves against an out-of-date schema.

The worker spawns connector containers through the host Docker daemon over the mounted `docker.sock`, so it must join the socket's owning group. `task docker-compose` reads that gid from the socket automatically. If you start with raw `docker compose`, set it yourself (a non-standard socket path also needs the worker's volume mount in `docker-compose.yml` changed):

```bash
WORKER_DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo 0) docker compose up -d --build
```

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
