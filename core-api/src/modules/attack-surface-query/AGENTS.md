# attack-surface-query module

AttackSurfaceQuery (ASQ): a JSON query language over the attack surface tables (targets, hosts, services, HTTP, technologies, TLS, URLs, IPs, DNS, findings, rollups), compiled to workspace-scoped, parameterized, read-only SQL. Serves the REST API, the console playground, the agent/MCP tools and query reports.

## Layout

- `domain/`: pure, no TypeORM. `query.schema.ts` (zod `QueryBatchSchema`, `.strict()` everywhere), `query-validator.ts` (`parseBatch`, `validateBatch`: paths, operators, values, limits, permissions; collects every issue with its path), `query-cost.ts` (static cost + hints), `query-limits.ts` (`limitsFor(caller, mode)`), `time-window.ts` (`now-5d`, ISO with offset), `query-signature.ts` (what a cursor is bound to), `query-errors.ts` (`AsqError`, codes → HTTP status).
- `catalog/`: `resources.ts` (one `ResourceDef` per resource: fields with SQL fragments, one-relations = JOIN, many-relations = include/EXISTS), `catalog.ts` (`CATALOG`, `assertCatalog` boot check, `describeCatalog`, type operators and value checks), `paths.ts` (`resolvePath` with "did you mean").
- `engine/`: `planner.ts` (`planQuery` → `QueryPlan`: list, aggregate, capped total, LATERAL includes), `compile-where.ts` (filter tree → SQL via the shared `compileFilter`; list paths → correlated `EXISTS`), `sql-builder.ts` (aliases, joins, scope predicates), `cursor.ts` (HMAC keyset cursors), `executor.ts` (`withReadOnlyUnit`, `executePlans`), `preflight.ts` (EXPLAIN gate), `pg-errors.ts`, `result-shaper.ts`, `concurrency.ts`.
- `attack-surface-query.service.ts` (run, explain, describe, report jobs), `asq-connections.service.ts` (semaphore, cursor codec, replica, RLS detection, catalog boot check), `asq-saved-queries.service.ts`, `asq-rollups.service.ts` (cron), `processors/asq-report.processor.ts`, `asq-error.interceptor.ts`.
- `entities/`: `AsqSavedQuery` (`asq_saved_queries`), `AsqSurfaceRollup` (`asq_surface_rollups`).
- Ops scripts: `core-api/scripts/asq-backfill.ts` (`task api:asq:backfill`), `core-api/scripts/asq-benchmark.ts` (`task api:asq:bench`, local DB only).

## Public surface

| Route | Permission |
|---|---|
| `GET attack-surface/schema`, `POST attack-surface/query`, `POST attack-surface/explain`, `GET attack-surface/jobs/:jobId` | membership (`@WorkspaceAccess()`); every resource a query reads is then checked: `asset.read`, `vulnerability.read`, `target.read` |
| `GET attack-surface/saved-queries[/:id]`, `POST saved-queries/:id/run` | `report.read` |
| `POST/PATCH/DELETE attack-surface/saved-queries[/:id]` | `report.write` |

- `POST query` with `options.mode = "report"` queues BullMQ `ASQ_REPORT` (`asq-report`, concurrency 1) and returns `{ jobId, status }`; the state and result live in Redis `asq:report:<workspaceId>:<jobId>` for 1 h (`REPORT_RESULT_TTL_S`). Report mode is HTTP only.
- Agent/MCP tools (agents module, `tools/attack-surface-query.tools.ts`): `describe_attack_surface`, `query_attack_surface` (read-only, on MCP, membership-gated; this module checks the per-resource keys). They are the agent's only way to list the attack surface; the built-in skill `agents/skills/attack-surface-query/SKILL.md` documents the language for the model and must change with the catalog (resources, fields, operators, limits).
- Console: the playground (`console/src/pages/attack-surface-query/`) is not released: no route or menu entry. The REST routes stay.
- Cron `AsqRollupsService.refreshAll`: `*/15 * * * *`, `@Lock('cron:asq-rollups')`.
- Exports `AttackSurfaceQueryService`, `AsqSavedQueriesService` (used by `agents` and `reports`).
- Env (optional): `ASQ_READ_REPLICA_URL` (report mode reads from it); `BETTER_AUTH_SECRET` keys the cursor HMAC (`asq-cursor-v1` label).

## Data model

- `asq_saved_queries`: unique `(workspaceId, name)`, `spec` jsonb (a `QueryBatchInput`, re-validated on every run), `createdBy` SET NULL. Workspace CASCADE.
- `asq_surface_rollups`: unique `(workspaceId, metric, key)`; metrics `port`, `technology`, `webserver`, `statusCode`, `tlsVersion` over each service's latest response. Replaced per workspace in one transaction.
- Reads the tenant columns added by migrations `AddWorkspaceScopeColumns` / `AddWorkspaceScopeConstraints`: `workspaceId` on every attack surface table (+ `targetId` on `asset_services`, `discovered_urls`), `asset_services.latestHttpResponseId`, `lastSeenAt` on assets and services. See `assets/AGENTS.md`.

## Invariants

- **Tenant scope is compiled, never supplied.** `workspaceId` comes from the guard or the agent run; zod `.strict()` refuses a `workspaceId` key anywhere. Every statement's WHERE starts with `<root>."workspaceId" = :ws`; every other term (project, base predicate, window, the caller's filter, keyset) is its own parenthesized AND term, so an `or` cannot escape. Every JOIN also matches `workspaceId`; every include and EXISTS re-applies the scope. `planner.spec.ts` checks this for every resource × field × operator.
- The DB enforces the same: composite FKs `(parentId, workspaceId) → parent(id, workspaceId)`, and when role `asq_reader` exists, each unit runs `SET LOCAL ROLE asq_reader` + `app.workspace_id` under RLS policies `asq_tenant`/`asq_others` (`AsqConnectionsService.rls`; without the role it logs a warning and relies on the compiler).
- Only catalog names reach SQL; values only travel as parameters (`compileFilter`, `ParamBag`). `assertCatalog` runs at boot: a fragment using an undeclared alias or a resource without a valid relation stops the boot. `describeCatalog` never exposes SQL or table names.
- Execution: one `BEGIN … READ ONLY` unit per query (or one REPEATABLE READ unit with `consistent`), `SET LOCAL statement_timeout`, always ROLLBACK + release. At most `ASQ_MAX_CONNECTIONS` (3) units per process; waiting > 2 s is `BUSY`. Interactive queries run `EXPLAIN (FORMAT JSON)` first and are refused over `maxPlannerCost`, or when a `bounded` sort covers more than `maxSortRows`.
- One query's runtime failure is its own `{ error }` result; validation, permission and static-cost failures reject the whole batch.
- "New" (`isNew`) uses `freshRunInCteSql` + the `asq_latest` CTE from `assets/fresh-runs.ts`: same rule as `freshRunSql` (e2e compares both).
- Vulnerabilities always carry `approvedVulnerabilityCondition`; `isOpen` is `openVulnerabilityCondition`.
- Pg errors never reach the caller (`mapPgError`); 22xxx/42xxx/25006 are logged with the SQL as compiler bugs.

## Coupling

- Imports nothing but TypeORM/BullMQ; uses the global `RedisService` and `DataSource`. Imports pure helpers from `assets/fresh-runs.ts` and `vulnerabilities/open-vulnerability.ts`.
- Imported by `AgentsModule` (tools) and `ReportsModule` (`POST reports/generate/query`).

## Gotchas

- A list path in `where` means "has at least one related row"; `neq`/`notIn`/`notContains` on it mean "has no related row that…" (compileFilter negates the whole EXISTS).
- `timestamp` columns are `timestamp without time zone`; the compiler compares and selects them as `timestamptz` (session time zone), and cursors carry ISO instants.
- Include orders are limited to `ManyRelationDef.indexedOrder` (LATERAL … LIMIT stops early only on an index).
- MCP calls have no member: they read `asset.read`, `vulnerability.read`, `target.read` of the API key's workspace.

## Testing

Unit: `domain/*.spec.ts`, `catalog/catalog.spec.ts`, `engine/planner.spec.ts` (with the scope property test), `engine/cursor.spec.ts`, `engine/runtime.spec.ts`, `engine/executor.spec.ts`, `attack-surface-query.service.spec.ts`, `attack-surface-query.controller.spec.ts`, `asq-background.spec.ts`. E2E (live DB): `core-api/test/attack-surface-query.e2e-spec.ts` (tenant isolation over every resource, triggers, composite FKs, RLS, read-only, timeouts, cursors, HTTP, report jobs).
