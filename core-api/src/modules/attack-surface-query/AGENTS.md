# attack-surface-query module

AttackSurfaceQuery (ASQ): a JSON query language over the attack surface tables (targets, hosts, services, HTTP, technologies, TLS, URLs, IPs, DNS, findings, rollups), compiled to workspace-scoped, parameterized, read-only SQL. Serves the REST API, the console playground, the agent/MCP tools and query reports.

## Layout

- `domain/`: pure, no TypeORM. `query.schema.ts` (zod `QueryBatchSchema`, `.strict()` everywhere; `where`/`having` are only shape-checked there), `query-validator.ts` (`parseBatch`, `validateBatch`: paths, operators, values, limits, permissions, `having`, `fill`, `options.timezone`; collects every issue with its path), `where.ts` (the `where` language: `normalizeWhere` → `WhereNode` tree of conditions, nested groups, `not`, relation tests; `conditionsOf`/`relationsOf`/`ownConditionsOf`), `having.ts` (`normalizeHaving`, `aggregateType`), `query-params.ts` (`applyParams`: saved-query `params` + `{ "$param" }` markers), `query-cost.ts` (static cost + hints), `query-limits.ts` (`limitsFor(caller, mode)`, incl. `filter` caps), `time-window.ts` (`now-5d`, ISO with offset), `query-signature.ts` (what a cursor is bound to), `query-errors.ts` (`AsqError`, codes → HTTP status).
- `catalog/`: `resources.ts` (one `ResourceDef` per resource: fields with SQL fragments, one-relations = JOIN, many-relations = include/EXISTS/relation tests), `catalog.ts` (`CATALOG`, `assertCatalog` boot check, `describeCatalog`, `TYPE_OPS` + `NULL_OPS` per field, `OP_VALUE_SHAPE`, value checks), `paths.ts` (`resolvePath` with "did you mean").
- `engine/`: `planner.ts` (`planQuery` → `QueryPlan`: list, aggregate, capped total, LATERAL includes), `compile-where.ts` (`WhereNode` → SQL: list paths → correlated `EXISTS`, relation tests → `(NOT) EXISTS` / `COUNT(*)` subqueries; ASQ's own compiler, the shared `common/utils/filter-tree.ts` is not used), `aggregate-sql.ts` (`aggregateExpr` with `FILTER (WHERE …)`, `compileHaving`, `fillSeries`), `sql-builder.ts` (aliases, joins, `tenantTerm`, scope predicates), `cursor.ts` (HMAC keyset cursors), `executor.ts` (`withReadOnlyUnit`, `executePlans`), `preflight.ts` (EXPLAIN gate), `pg-errors.ts`, `result-shaper.ts`, `concurrency.ts`.
- `attack-surface-query.service.ts` (run, explain, describe, report jobs), `asq-connections.service.ts` (semaphore, cursor codec, replica, RLS detection, catalog boot check), `asq-saved-queries.service.ts`, `asq-rollups.service.ts` (cron), `processors/asq-report.processor.ts`, `asq-error.interceptor.ts`.
- `entities/`: `AsqSavedQuery` (`asq_saved_queries`), `AsqSurfaceRollup` (`asq_surface_rollups`).
- Ops scripts: `core-api/scripts/asq-backfill.ts` (`task api:asq:backfill`), `core-api/scripts/asq-benchmark.ts` (`task api:asq:bench`, local DB only).

## Public surface

| Route | Permission |
|---|---|
| `GET attack-surface/schema`, `POST attack-surface/query`, `POST attack-surface/explain`, `GET attack-surface/jobs/:jobId` | membership (`@WorkspaceAccess()`); every resource a query reads is then checked: `asset.read`, `vulnerability.read`, `target.read` |
| `GET attack-surface/saved-queries[/:id]`, `POST saved-queries/:id/run` (body `{ params? }`, optional) | `report.read` |
| `POST/PATCH/DELETE attack-surface/saved-queries[/:id]` | `report.write` |

- `POST query` with `options.mode = "report"` queues BullMQ `ASQ_REPORT` (`asq-report`, concurrency 1) and returns `{ jobId, status }`; the state and result live in Redis `asq:report:<workspaceId>:<jobId>` for 1 h (`REPORT_RESULT_TTL_S`). Report mode is HTTP only.
- Agent/MCP tools (agents module, `tools/attack-surface-query.tools.ts`): `describe_attack_surface`, `query_attack_surface` (read-only, on MCP, membership-gated; this module checks the per-resource keys). They are the agent's only way to list the attack surface; the built-in skill `agents/skills/attack-surface-query/SKILL.md` documents the language for the model and must change with the catalog (resources, fields, operators, limits): `agents.asq-skill.spec.ts` runs every recipe of the skill through `validateBatch` + the agent budget. The tool description embeds `catalogCheatSheet(CATALOG)` (one line per resource: field names, types, relations), so new fields reach the model without editing prompts.
- Agent limits (`query-limits.ts`): 200 rows, cost budget 1000, sized so a full page of any resource over all time with a total, and an all-time count, fit (`query-validator.spec.ts` checks every root). Error messages list the valid names (`namesOf` for unknown fields, groupable/sortable fields), so the model can fix a call in one step.
- Callers (`AsqCaller`): `http`, `agent`, `mcp`, `report`. `report` is in-process only: the reports controller builds the scope (workspace and permissions from the guard, never from a request body) to run PDF report batches synchronously (`mode: interactive`, `consistent: true`). Its profile `REPORT_SYNC` (`query-limits.ts`) is HTTP-like (authenticated member, heavy fields allowed, `parallel` 1 in `execute`, only `http` gets 3) with bigger pages (10 000 rows, 100 000-char strings, 1000 filter values), cost budget 60 000, 30 s statement / 60 s batch, 32 MiB response. `options.mode = "report"` (the queued job) stays `http` only and is refused for `report`.
- Catalog fields added for the PDF reports (no schema change): `vulnerabilities` `description`/`solution` (`heavy`: refused for agents, allowed for `http`/`report`), `cvssMetric`, `vprScore`, `bid` (`bidId`), `references`, `ipAddress`, `hostName` (`host` column), `publishedAt`, `firstDetected`, `analyzeStatus`, `isDismissed` (unexpired dismissal, same rule as `openVulnerabilityCondition`). `tags` is a root (`firstSeen`, one `service`, `projectScope` by service); its table already had `workspaceId`, RLS and the grant.
- Console: the playground (`console/src/pages/attack-surface-query/`) is not released: no route or menu entry. The REST routes stay.
- Cron `AsqRollupsService.refreshAll`: `*/15 * * * *`, `@Lock('cron:asq-rollups')`.
- Exports `AttackSurfaceQueryService`, `AsqSavedQueriesService` (used by `agents` and `reports`).
- Env (optional): `ASQ_READ_REPLICA_URL` (report mode reads from it); `BETTER_AUTH_SECRET` keys the cursor HMAC (`asq-cursor-v1` label) through `resolveSigningSecret` (auth module): required when deployed, better-auth's public fallback in local and test runs, so the CI e2e job (no secret) boots.

## Data model

- `asq_saved_queries`: unique `(workspaceId, name)`, `spec` jsonb (a `QueryBatchInput`, plus an optional `params` declaration; re-validated on every run), `createdBy` SET NULL. Workspace CASCADE.
- `asq_surface_rollups`: unique `(workspaceId, metric, key)`; metrics `port`, `technology`, `webserver`, `statusCode`, `tlsVersion` over each service's latest response. Replaced per workspace in one transaction.
- Reads the tenant columns added by migrations `AddWorkspaceScopeColumns` / `AddWorkspaceScopeConstraints`: `workspaceId` on every attack surface table (+ `targetId` on `asset_services`, `discovered_urls`), `asset_services.latestHttpResponseId`, `lastSeenAt` on assets and services. See `assets/AGENTS.md`.

## Invariants

- **Tenant scope is compiled, never supplied.** `workspaceId` comes from the guard or the agent run; zod `.strict()` refuses a `workspaceId` key anywhere. Every statement's WHERE starts with the root's tenant term (`tenantTerm`: `<root>."workspaceId" = :ws`, or the resource's `scopePredicate`); every other term (project, base predicate, window, the caller's filter, keyset, HAVING) is its own parenthesized AND term, so an `or` or a `not` cannot escape. Every JOIN also matches `workspaceId` (or the `:ws` parameter / predicate when either side has no column); every include, EXISTS, relation test and `COUNT` subquery re-applies the child's tenant term. `planner.spec.ts` checks this for every resource × field × operator (negated) and every relation × quantifier/count.
- **Saved-query params never reach SQL text.** `applyParams` swaps `{ "$param" }` markers on the raw JSON before `parseBatch`, only in `value` / `limit` / `since` / `until` positions; zod and the validator then check the substituted values like literal ones. Every param must declare a default, and the spec is validated with the defaults when saved; reports (`runSpec`) run it with the defaults.
- `options.timezone` must pass `Intl.DateTimeFormat` and a name regex; it reaches SQL as a parameter (`date_trunc(…, CAST(:p AS text))`, the 4-argument `generate_series`, Postgres 16+). Without it the literal `'UTC'` is emitted, so older queries compile to the same SQL.
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

- A list path in `where` means "has at least one related row"; `neq`/`notIn`/`notContains` on it mean "has no related row that…" (the compiler negates the whole EXISTS).
- Relation tests: `every` is true for a row with no related rows; inside a relation test's `where` there is no second list (`NESTED_RULES`). `between` includes both ends. Group depth counts groups only (`filter.depth`, root = 1); `not` chains are capped at 8.
- `fill` sizes the series from the window (`fillPoints`, an upper bound) and sets `limit` to it when the caller gave none; `having` runs inside the series, so a bucket it drops comes back as 0.
- Aggregate filters compile with their own sub-alias counter (`r_x0` may appear in both the WHERE and a `FILTER`): each lives in its own subquery, so this is legal SQL.

## Adding a resource

1. The table (a migration, approved first: see the repo `AGENTS.md`) carries `workspaceId` with a composite FK to its parent and the `asq_fill_scope` trigger, and the migration grants `SELECT` to `asq_reader` and adds the `asq_tenant`/`asq_others` policies (as `AddWorkspaceScopeConstraints` does for `RLS_TABLES`). A table without `workspaceId` instead declares `scopePredicate` (`{a}`, `{ws}`, a `"workspaceId"` column) and only needs the `SELECT` grant (like `RLS_PLAIN_GRANTS`).
2. A `ResourceDef` in `resources.ts`, listed in `RESOURCES`: `permission` is an existing route key; never declare secret or encrypted columns (every declared field is selectable, filterable and groupable by whoever reads the resource; `heavy` keeps a field from agents only).
3. Many-relations from the parents that should reach it, with `indexedOrder` backed by an index.
4. `SKILL.md` (table of resources, recipes) and the e2e isolation test. `catalog and database agree` in `test/attack-surface-query.e2e-spec.ts` fails when the grant, the column or the policy is missing, and when a declared field does not run under `asq_reader`.
- `timestamp` columns are `timestamp without time zone`; the compiler compares and selects them as `timestamptz` (session time zone), and cursors carry ISO instants.
- Include orders are limited to `ManyRelationDef.indexedOrder` (LATERAL … LIMIT stops early only on an index).
- MCP calls have no member: they read `asset.read`, `vulnerability.read`, `target.read` of the API key's workspace.

## Testing

Unit: `domain/*.spec.ts` (`query-validator.spec.ts` covers `where`, aggregates, `having`, `fill`, time zones; `query-params.spec.ts`), `catalog/catalog.spec.ts`, `engine/planner.spec.ts` (with the scope property test and a predicate-scoped test catalog), `engine/cursor.spec.ts`, `engine/runtime.spec.ts`, `engine/executor.spec.ts`, `attack-surface-query.service.spec.ts`, `attack-surface-query.controller.spec.ts`, `asq-background.spec.ts`. E2E (live DB): `core-api/test/attack-surface-query.e2e-spec.ts` (tenant isolation over every resource, triggers, composite FKs, RLS, read-only, timeouts, cursors, the new language constructs on Postgres, catalog ↔ database agreement, HTTP incl. saved-query params, report jobs).
