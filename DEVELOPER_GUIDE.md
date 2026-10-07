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
  - [Why there are two S3 clients](#why-there-are-two-s3-clients)
  - [Browser PUT requirements](#browser-put-requirements)
  - [nginx pass-through](#nginx-pass-through-self-hosted-only)
  - [Switching to real S3](#switching-to-real-s3-configuration-only)
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

Object-storage bytes no longer stream through core-api. The console asks
core-api for a short-lived presigned URL, then talks to S3 / RustFS directly, so
upload and download traffic bypasses the API process.

### Flow

1. The console calls a presign endpoint on core-api
   (`core-api/src/modules/storage/storage.controller.ts`).
2. core-api validates bucket and key, signs with SigV4, returns an absolute URL.
3. The console `fetch`es that URL via `console/src/services/storage.ts`:
   `PUT` for uploads, plain `GET` for downloads.
4. The browser talks to object storage, not to core-api.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/storage/presign/upload` | POST | Presigned `PUT` into any non-private bucket. `@Roles(Role.ADMIN)`. |
| `/api/storage/presign/download` | GET | Presigned `GET`; optional `fileName` becomes `Content-Disposition`. Authorized by the same `authorizeRead` classes as direct reads (see below), so a URL for another workspace's screenshot or template is refused with 403 before signing. Declared before the `:bucket/:path` wildcard on purpose, otherwise Express swallows the literal path. |
| `/api/storage/logo/presign` | POST | Presigned `PUT` for the app logo: `system` bucket, `logo-` prefix, image extensions only. `@Roles(Role.ADMIN)`. |
| `/api/storage/logo/confirm` | POST | `HeadObject` on the uploaded key, validates content type and size, then activates the logo. `@Roles(Role.ADMIN)`. |
| `/api/templates/:templateId/presign` | POST | Presigned `PUT` for a template YAML. Requires workspace permission `template.write`. |

Buckets come from `StorageService.buckets`; `privateBuckets = ['reports',
'job-results']` are rejected by every presign endpoint.

`logo/confirm` is the only server-side check in the flow. It heads the object
and rejects non-images and anything above `LOGO_MAX_SIZE_BYTES` (5 MB,
`storage.controller.ts:38`), and it runs *after* the bytes are already in
storage.

### Why there are two S3 clients

`core-api/src/modules/storage/rustfs.client.ts` builds two `S3Client` instances:

| Accessor | Endpoint | Used for |
| --- | --- | --- |
| `getClient()` | `RUSTFS_ENDPOINT` (default `http://localhost:9000`) | Internal server-side work: bucket creation, `PutBucketCors`, tool archives, worker reads. |
| `getPresignClient()` | `S3_PUBLIC_ENDPOINT`, falling back to `RUSTFS_ENDPOINT` | Signing URLs that a browser will call. |

`S3_REGION` and `S3_FORCE_PATH_STYLE` apply to **both** clients — they are read
once in `parseStorageConfig` and handed to each. Only the endpoint differs. The
internal client is still forbidden from using `S3_PUBLIC_ENDPOINT`.

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

### Browser PUT requirements

- **Send the exact signed `Content-Type`.** When a content type was signed,
  `getPresignedUploadUrl` passes `signableHeaders: new Set(['content-type'])`
  (`storage.service.ts:268`). Any drift, including a browser default, is a 403
  `SignatureDoesNotMatch`. `console/src/services/storage.ts` is the single place
  that echoes the header, and callers must pass through the `contentType` the
  presign response returned.
- **Use plain `fetch`, not the shared axios client.** A presigned URL is
  absolute (its own baseURL must not be prefixed) and the signature covers the
  exact request; the axios instance would attach auth headers, cookies and
  param serialisation and perturb the signature into a 403.

### nginx pass-through (self-hosted only)

In the Docker deployment the browser hits the console origin, so
`console/nginx.conf` hands signed requests to the storage backend:

- `map $args $is_presigned` matches `(^|&)X-Amz-Signature=`. nginx cannot build
  a variable name containing hyphens (`$arg_X-Amz-Signature` parses as
  `$arg_X` plus literal text and is always truthy), so the query string is
  matched instead.
- The signed request leaves through `error_page 418 = @object_storage`, so the
  rewrite phase runs before `try_files`.
- Both `location /` and the static-asset location must `return 418` when
  `$is_presigned`. Without the guard a presigned key ending in
  `.webp`/`.jpg`/`.gif` is answered by the static location, which 404s into
  `index.html` instead of reaching storage.
- Inside `@object_storage` the path must **not** be rewritten (SigV4 signs the
  path), and `Host` is forwarded as `$http_host`, not `$host`: the signature
  covers `host:port` and `$host` strips the port.
- Adding a `/s3/` prefix, or any other path rewrite, produces
  `SignatureDoesNotMatch` on every upload and download.

### Switching to real S3 (configuration only)

No code change. Set in `core-api/.env`:

| Variable | Value |
| --- | --- |
| `RUSTFS_ENDPOINT` | Endpoint the **API** reaches (e.g. the in-network or VPC endpoint). Required in the cloud — it is the internal ops endpoint, and it is deliberately never read from `S3_PUBLIC_ENDPOINT`. |
| `S3_PUBLIC_ENDPOINT` | Endpoint the browser can reach, e.g. `https://s3.eu-central-1.amazonaws.com`. Presign only. |
| `S3_REGION` | The bucket's region. Signs **both** clients — the internal client is not pinned to `us-east-1`. |
| `S3_FORCE_PATH_STYLE` | `false`. Applies to **both** clients. |
| `S3_USE_DEFAULT_CREDENTIALS` | `true` for IAM roles / instance profiles; otherwise leave `false` and set `S3_ACCESS_KEY` + `S3_SECRET_KEY` |
| `S3_CORS_ALLOWED_ORIGINS` | Comma-separated console origins |

`StorageService.onModuleInit` applies the CORS rule to every bucket on boot
(`GET, PUT, POST, HEAD`, `AllowedHeaders: *`, exposes `ETag`), and skips it
entirely when the origins list is empty.

The nginx pass-through above is path-style, same-origin, self-hosted storage
only. AWS S3 rejects an arbitrary `Host`, so a cloud deployment drops the proxy
and relies on the direct endpoint plus that bucket CORS.

Defaults, clamping and parsing for every variable above live in
`core-api/src/modules/storage/storage.config.ts`. `S3_PRESIGN_TTL` defaults to
900 s and is clamped to 60 s ... 604800 s. Treat that file as the source of
truth, not this section.

### Direct-read authorization (`GET /api/storage/:bucket/:path`)

Direct reads are authorized, not world-readable. The handler is `@Optional()`
(`storage.controller.ts:234`): the global `AuthGuard` still runs and populates
`request.user`, while unauthenticated requests pass through so the login page
can render the logo from the `system` bucket before a session exists. Both
direct reads and `presign/download` share one helper, `authorizeRead`
(`storage.controller.ts:317`), over the bucket classes from
`StorageService.getBucketAccess` (`storage.service.ts:58`):

| Class | Buckets | Rule |
| --- | --- | --- |
| `public` | `system` | Anonymous reads allowed. |
| `authenticated` | `cached-static` | Any session allowed; anonymous gets 401. |
| `tenant` | `screenshot`, `nuclei-templates` | Anonymous gets 401; ownership resolved via `resolveObjectWorkspaceIds` (`storage.service.ts:166`), membership of ANY owning workspace required, otherwise 403; unknown keys return 404 so the endpoint is not a workspace-existence oracle. |
| `private` | `reports`, `job-results` | Never served over HTTP: 403. |
| `blocked` | `default` and anything unknown | 404 as if the object did not exist. |

Status semantics: 401 means no session on an `authenticated`/`tenant` bucket;
403 means a session without membership (or a `private` bucket); 404 means
`blocked`, or a tenant key with no owner row. `presign/download` applies the
same helper after `assertBucketAllowed` (400) and `assertBucketNotPrivate`
(403), so its guard order is 400, 403, then 401/403/404 from `authorizeRead`.

This deliberately deviates from the audit allow-list, which recommended
`system`, `nuclei-templates` and `cached-static` as public. The console sits
behind auth, so no anonymous consumer needs those two buckets:
`cached-static` is session-gated and `nuclei-templates` is tenant-gated with
no anonymous path lost.

Conditional GET: authorized reads return `ETag`/`Last-Modified` from the same
`GetObjectCommand` and answer `If-None-Match`/`If-Modified-Since` with 304
(`isNotModified`, `storage.controller.ts:362`); the 304 destroys the already
opened S3 stream so no socket is held. `Cache-Control` is `public,
max-age=1209600, no-transform` on `system` only (14 days via
`CACHE_STATIC_RESOURCE`) and `private, no-cache` on every authorized bucket.

Residual risk: screenshot keys are `md5(asset.value)`
(`data-adapter.service.ts:641`), a flat key with no workspace prefix, so two
workspaces scanning the same hostname share one key. md5 is not collision
resistant, so a crafted value could alias another tenant's key; the mitigation
is that authorization checks membership of ANY owning workspace
(`resolveObjectWorkspaceIds` returns every distinct owner, never one
arbitrary row), and finding or guessing a key still requires a session in at
least one owning workspace. `nuclei-templates` keys are `<templateId>.yaml`
and resolve by exact template id, so no cross-workspace aliasing there.

Accepted cost: `@Optional()` still performs a `getSession` lookup
(`auth.guard.ts:96`) even on anonymous `system` reads, before `authorizeRead`
short-circuits. One session lookup per logo fetch on the login page is the
price of keeping that page working without a public bypass.

Finding AE-02 in [`docs/security-audit-report.md`](docs/security-audit-report.md)
is closed by this model; the previous "still `@Public()`" note below is
superseded by this section.

### Deferred and still open

- **No server-side max size on a presigned `PUT`.** A signed `PUT` is accepted
  by the storage backend for whatever body the client sends. The only cap in the
  self-hosted deployment is `client_max_body_size 100m` in
  `console/nginx.conf`. Enforce a real limit at the storage layer.
- **Deliberately absent:** presigned POST, CloudFront signing, multipart and
  resumable uploads. They do not exist.

### Direct object reads through nginx (`/files/`)

Self-hosted deployments stream object bytes without waking core-api. The browser
asks the console origin for `/files/<bucket>/<key>`; nginx authorizes the
request against core-api and then proxies the object straight from RustFS,
signing each upstream read with njs SigV4. core-api carries no bytes on this
path.

```
browser -> nginx (auth_request -> core /api/storage/authz) -> RustFS
```

1. nginx derives `<bucket>`/`<key>` from `$request_uri` with njs
   (`console/nginx/s3auth.js`) and runs `auth_request` against an internal
   location that proxies to `GET /api/storage/authz` (`console/nginx.conf:58`).
   The handler (`storage.controller.ts:241`) runs the same `authorizeRead`
   (`storage.controller.ts:354`) as the direct-read endpoint and may answer only
   200, 401 or 403; nginx turns anything else into 500, so the handler maps a
   missing object to 403. The session cookie is forwarded on the subrequest
   (`Cookie $http_cookie`).
2. On 200 the `^~ /files/` location (`console/nginx.conf:70`) proxies
   `/files/<bucket>/<key>` to `http://rustfs:9000` with the `Authorization`,
   `x-amz-date` and `x-amz-content-sha256` headers the wrapper produces. `^~`
   makes this prefix win over the static-asset regex, so a stored `.webp` or
   `.jpg` object is streamed from storage instead of being answered by the SPA.

The bucket stays private. Every upstream read is signed, whatever its authz
class, so RustFS needs no public bucket policy: an anonymous
`curl http://localhost:9000/<bucket>/<key>` still returns 403.

#### Deriving bucket and key

`$files_bucket` and `$files_key` come from `$request_uri`, not `$uri`. An
`auth_request` subrequest has its own `$uri` (`/_files_auth`), so `$uri` would
yield garbage here and deny every read. One parse feeds the authz headers, the
proxied path and the SigV4 canonical URI alike, so bucket and key cannot diverge
between them.

Each slash-separated segment must match `[0-9A-Za-z._-]+` (the full key charset
is `[0-9A-Za-z._/-]`). Empty segments, `.`, `..` and a malformed percent-escape
are rejected in njs, and the authz handler re-checks `.`/`..` as defence in
depth. Current keys keep this invariant without a key change: screenshot keys
are `md5(asset.value)` and template keys are `<templateId>.yaml`.

#### Signing

`console/nginx/s3auth.js` builds the SigV4 headers. It pins `Host rustfs:9000`
for both signing and the proxied request, because the default upstream `Host`
would be the block name (`object_storage`) and break the signature. It memoizes
one timestamp per request so `x-amz-date` and `Authorization` cannot straddle a
second boundary. The signing credentials are the RustFS access and secret keys
injected into the console container by compose (`env RUSTFS_ACCESS_KEY;` in
`console/nginx/nginx.conf`), never baked into the image. Without them `$s3auth`
is empty and the location guard rejects the request rather than forwarding it
unsigned.

`proxy_pass_request_headers off` keeps the signature intact but also strips
`If-None-Match`, `If-Modified-Since` and `Range`, so the `/files/` location
re-adds them explicitly. Conditional GET then returns 304 and range requests
return partial content straight from RustFS.

#### Caching

The location sends `Cache-Control` from a `map $files_bucket
$files_cache_control` that lives in the main `console/nginx/nginx.conf` (`map`
is http-context only). `system` is `public, max-age=1209600, no-transform` (14
days, the same TTL as `CACHE_STATIC_RESOURCE`); every tenant bucket is `private,
no-cache`. There is deliberately no `proxy_cache` on `/files/`: tenant objects
must never land in a shared cache.

#### Who can read what

The direct buckets are `screenshot`, `cached-static` and `system`
(`console/nginx.conf:74`). Any other bucket is refused at the location guard
before the auth subrequest runs. `system` is public. `cached-static` is readable
by any logged-in user, since it holds shared global assets with no
per-workspace rule. `screenshot` stays tenant-scoped through `authorizeRead`
(ownership by any workspace that scans the key). `reports` and `job-results`
are never served this way, and `nuclei-templates` stays on the presigned flow.

#### Cloud and IAM deployments

The nginx path is self-hosted only. AWS S3, and any backend reached through a
public endpoint, rejects an arbitrary `Host`, so a cloud deployment drops the
proxy and keeps the existing direct/presigned flow. The signer also needs static
credentials: with `S3_USE_DEFAULT_CREDENTIALS=true` (IAM roles, instance
profiles) there is no secret for njs to sign with. In that case keep the direct
endpoint plus bucket CORS and do not enable `/files/`.

`GET /api/storage/authz` is also reachable through the existing `/api/` proxy
(`console/nginx.conf:146`) and returns 200, 401 or 403 with an empty body. That
makes it a read-only oracle for whether a bucket/key exists and whether a
session may read it, exposing no object data. It is the same class of disclosure
as the `/api/storage/:bucket/:path` proxy it sits beside, so it is accepted;
gate it later if you want to remove it.

#### Development

`task console:dev` works because Vite proxies `/files` to core-api with a
rewrite to `/api/storage` (`console/vite.config.ts:87`), which preserves the
same authz semantics. Caveat: that rewrite targets `GET /api/storage/:bucket/:path`
(`storage.controller.ts:272`), whose `:path` matches a single segment, so only
single-segment keys resolve in dev. Nested keys 404 in dev only; production
nginx has no such limit.

#### Rollback

Reverting the API-side base switch and the nginx `/files/` locations (plan todos
2 and 4) restores the previous behaviour. Cached `/files/` URLs 404 until the
console refetches the API-emitted base; the `/api/storage/:bucket/:path` proxy
and the presigned flow remain, so nothing is lost.

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
