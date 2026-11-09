# targets module

Scan roots of a workspace: a domain, IP, CIDR or Git organization. A target owns its assets. Creating one creates its first assets and kicks off the matching workflow through an in-process event.

## Layout

- `targets.controller.ts`: HTTP routes on `targets`.
- `targets.service.ts`: `TargetsService`: validation, bulk create (with assets), update, delete, scan schedule, CSV export, GIT_ORG repositories.
- `target-overview.service.ts`: `TargetOverviewService`: overview, runs, changes, summary (raw SQL over assets, jobs, vulnerabilities, issues, projects). Exports `STALE_DAYS = 30`.
- `entities/target.entity.ts`: `Target`, `TargetSource`, `GitOrgTargetSettings`. `TargetType` lives in `common/enums/enum.ts` and is re-exported here.
- `cidr.ts` (parse/format/overlap), `target-logo.ts` (`resolveTargetLogo`), `target-source.dto.ts` (source enrichment).
- `dto/targets.dto.ts`, `dto/target-overview.dto.ts`.

## Public surface

| Route | Permission |
|---|---|
| `POST targets/bulk` | `target.write`, **and** the caller must own the workspace (see Invariants) |
| `GET targets`, `GET targets/export` (CSV), `GET targets/summary` | `target.read` |
| `GET targets/:id`, `:id/overview`, `:id/runs`, `:id/changes`, `:id/repositories` | `target.read` |
| `PATCH targets/:id` (scanSchedule, GIT_ORG settings) | `target.write` |
| `POST targets/:id/re-scan` | `target.write`; delegates to `AssetsService.reScan` |
| `DELETE targets/:id` | `target.write`, **and** workspace owner |

- `@Global()`, exports `TargetsService`. It also provides `TriggerWorkflowService` (from `workflows/`), and this is the **only** module that provides it.
- Event bridge: `@PublishEvent` sends `target.created` (bulk) and `target.updated` (PATCH). `target.deleted` is not on the stream: `deleteTarget` writes it only as an audit row via `AuditService.auditSafely`. After the create transaction, `createMultipleTargets` publishes `asset.discovered` once per target for its new assets.
- In-process events (`EventEmitter2`): `target.<type>.create` for each created target (`target.domain.create`, `target.cidr.create`, `target.ip.create`, `target.git_org.create`), and `target.git_org.re-scan` when GIT_ORG settings change.
- BullMQ: registers `ASSETS_DISCOVERY_SCHEDULE` and adds one repeatable job per scheduled target (job name = target id, data `{ id }`, `repeat.pattern` = the `CronSchedule` value). The consumer is `AssetsDiscoveryScheduleConsumer` in `jobs-registry/processors/scan-schedule.processor.ts`.
- MCP/agent tools: `retrieve_targets` (`getTargetsTool` in `agents/tools/workspace.tools.ts`, also on MCP) calls `getTargetsInWorkspace`. Agent-only `create_project` and `add_targets` call `createMultipleTargets` through `ensureTargets` in `agents/tools/project-build.tools.ts`. `ensureTargets` looks up existing targets from `result.skipped`, which is always empty (see Gotchas).

## Data model

- `targets`: unique `(workspaceId, value)` in the DB (also on the entity). Hard delete, no soft delete.
- FKs: `workspaceId` → workspace CASCADE; `internalNetworkId` → internal network CASCADE (deleting a network deletes its targets); `integrationId` → integration SET NULL (a GIT_ORG target stays, syncing pauses).
- Deleting a target cascades in the DB to `assets` and from there to services, jobs, vulnerabilities (and their comments). `issue_links` rows that point at it are not removed (they have no FK).
- `jobId` holds the BullMQ `repeatJobKey`, not a job id. `status`, `totalAssets`, `totalAssetServices` and `logo` are computed, not columns.
- `source` is set once at creation: `gitOrgSources` (github/gitlab from the integration) → the caller's `source` argument → `MANUAL`.

## Invariants

- `createMultipleTargets` and `deleteTarget` call `WorkspacesService.getWorkspaceByIdAndOwner`: 403 unless the caller is the workspace **owner**, whatever role permissions say. Integration connectors pass `actingUserContext`. `InternalNetworksService` passes the user it was called with.
- Validation (`validateTargetValue`): DOMAIN must not be an IP; IP and CIDR must be public; CIDR prefix must be /24–/32. `source = AWS` (`isTrustedCidrSource`) allows private ranges and any prefix. GIT_ORG values match `GIT_ORG_VALUE_REGEX`, are lower-cased and trimmed of trailing slashes, and must name a SOURCE_CODE integration of the same workspace whose host prefixes the value.
- Manual CIDRs (not internal network, not AWS) are normalised to the network address (`formatCidr(parseCidr())`) and rejected when they overlap another external CIDR of the workspace or of the same request (`assertNoCidrOverlap`).
- Assets created on insert: DOMAIN/IP get one primary asset. CIDR gets **one asset per address** (`expandCIDRToIPs`, the first one is primary), inserted in chunks of `ASSET_INSERT_CHUNK = 1000` with `orIgnore`. GIT_ORG gets none; repositories come from `RepositorySyncService` on `target.git_org.create`.
- Every service query filters on `workspaceId` directly (targets carry it, no join needed).

## Coupling

- `TargetsService` injects `AssetsService` (and exposes it as public `assetService`), `WorkspacesService`, `AuditService` and `EventBridgeService`. It writes `assets` rows directly inside its transaction.
- `TriggerWorkflowService.onModuleInit` subscribes with `eventEmitter.onAny`, so **every** in-process event in the app is treated as a possible workflow trigger: `<a>.<b>` is matched against `workflow.content.on.<a>` containing `<b>`, and the payload is resolved to a workspace through `payload.id` as a target id. Project workflows (`project-%`, `group-%` file paths) are excluded.
- Callers of `TargetsService`: integrations connectors (aws, cloudflare, vercel: `findByWorkspaceAndValues` then `createMultipleTargets`), `InternalNetworksService`, `SearchService`, agents tools. `StatisticModule` and `SearchModule` import `TargetsModule`.
- Other code that touches `targets` directly: `AssetsService.reScan` updates `reScanCount` and `lastDiscoveredAt`. `WorkspacesService` bulk-deletes a workspace's targets and resolves `getWorkspaceIdByTargetId` (cached 60 s). `StatisticService` reads the table.

## Gotchas

- Duplicates are **rejected, not skipped**: any value that already exists gives `400 Target already exists: …`, even though `BulkTargetResultDto` has `skipped`/`totalSkipped` and the Swagger text says "skipping duplicates". `skipped` is always empty. The per-internal-network duplicate branch cannot help either: the DB unique `(workspaceId, value)` still blocks the same value on a second network.
- `GET targets/:id` returns an empty 200 body, not 404, for an unknown id (`getTargetById` returns the raw row or `undefined`).
- Static routes (`summary`, `export`) are declared before `:id`; keep that order when adding routes.
- `onModuleInit` → `handleUpdateScanSchedule` re-creates schedulers for targets with a schedule and no `jobId` on every boot. Changing `scanSchedule` removes the old scheduler by `jobId` first.
- The schedule job data is `{ id }` only. The consumer passes `job.data.workspaceId` (undefined) to `reScan`, and TypeORM drops `undefined` keys from `where`, so the lookup ends up by id only.

## Testing

Unit specs: `targets.service.spec.ts`, `targets.controller.spec.ts`, `target-overview.service.spec.ts`, `cidr.spec.ts`, `target-logo.spec.ts`, `target-source.dto.spec.ts`. E2E: `core-api/test/targets.e2e-spec.ts`.
