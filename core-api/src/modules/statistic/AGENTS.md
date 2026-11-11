# statistic module

Dashboard numbers for a workspace (live counts, timelines, top-N lists, TLS and geo breakdowns), the daily `workspace_statistics` snapshot, the security score, and the `workflow.run.completed` event for discovery runs.

## Layout

- `statistic.service.ts`: `StatisticService`, all queries (raw SQL / query builders over other modules' tables), Redis caching, workflow start/end handlers.
- `statistic-cron.service.ts`: `@Cron('0 0 * * *')` + `@Lock('cron:statistic-daily', { ttl: 600_000 })` → `calculateAndStoreStatistics()`.
- `statistic.controller.ts`: read-only routes under `statistic`.
- `entities/statistic.entity.ts`: `Statistic` (`workspace_statistics`).
- `dto/`: one DTO file per endpoint.

## Public surface

All routes are `GET`, `@WorkspaceAccess('workspace.read')`, workspace from the `X-Workspace-Id` header/cookie:
`statistic`, `statistic/timeline`, `statistic/issues-timeline`, `statistic/top-tags-assets`, `statistic/asset-locations`, `statistic/tls`, `statistic/attention`, `statistic/top-assets-vulnerabilities`, `statistic/top-ports`, `statistic/top-technologies`.

- `statistic/attention` (`getAttention`) is the dashboard's "Needs attention": raw counts go through the pure `buildWorkspaceInsights` in `workspace-insights.ts`, which drops zero counts and orders worst first. Its TLS count is `getTlsStatistics` `alreadyExpired + expireInAMonth`, so it matches the Certificates card. "Failed runs" are distinct `jobHistoryId`s with a failed job of the workspace in 7 days (jobs have no `workspaceId`; the path is asset → target). `InsightLevel` is reused from `targets/dto/target-overview.dto.ts`.

- Registered in `combine.module.ts`. Exports `StatisticService`.
- Agent tool use: `agents/tools/workspace.tools.ts` calls `getStatistics`.
- Consumes in-process `EventEmitter2` events `EventTriggerType.WORKFLOW_START` and `WORKFLOW_END` (`@OnEvent`, emitted by `jobs-registry.service.ts` and `workflow-runner.service.ts`).
- Publishes `workflow.run.completed` (`WorkflowRunCompletedPayload`) through `EventBridgeService.publishSafely`, only for runs of `DefaultWorkflow.DOMAIN_DISCOVERY` / `IP_ADDRESS_DISCOVERY`.

## Data model

- `workspace_statistics`: counters (`assets`, `targets`, `vuls`, per-severity `*Vuls`, `techs`, `ports`, `services`), `score` decimal(5,2), `workspace` ManyToOne CASCADE, index `(workspace, createdAt)`.
- A row is written by the daily cron **only when a number changed** since the workspace's latest row (`filterChangedStatistics`, `DISTINCT ON`). Readers must carry the last snapshot forward; `toDailySeries` does that and also reads the last row before the 3-month window as the baseline.

## Invariants

- Vulnerability numbers count **open** findings only (`openVulnerabilityCondition` from `vulnerabilities/open-vulnerability.ts`). `vuls` excludes `info`; `infoVuls` is stored separately. Timeline points recompute `vuls` from the severity columns because older snapshots included info.
- `calculateSecurityScore` (static) is the one score formula for the dashboard and the PDF reports: capped, diminishing penalties per severity, info ignored, any open critical caps at 69 and any open high at 89, floored. Changing it moves every grade band in the console.
- Live numbers are cached in Redis for 60 s (`statistic:current:<workspaceId>`), asset locations for 10 min (`statistic:asset-locations:<workspaceId>`). A Redis failure only skips the cache. Tests or features that write data and read stats immediately see stale numbers for up to a minute.
- Discovery-run diffs: `handleWorkflowStart` stores a per-target snapshot in Redis (`snapshot:<filePath>:<targetId>`, 24 h); `handleWorkflowEnd` diffs against it (missing snapshot = zero baseline, so counts can be overstated) and deletes the key. The run's workspace comes from `WorkspacesService.getMemberOfWorkspaceByJobId`; with no members the event is dropped. `outcome: 'failure'` means the run did not finish (failed / blocked / cancelled steps), not a publish error.

## Coupling

- `StatisticService` injects `DataSource`, `GeoIpService`, `RedisService`, `WorkspacesService`, `EventBridgeService`, `TechnologyForwarderService` (global `TechnologyModule`). It queries `targets`, `assets`, `asset_services`, `asset_tags`, `vulnerabilities`, `tls_certificates` and more directly; it does not call those modules' services.
- The module imports `TargetsModule`, `AssetsModule`, `forwardRef(() => VulnerabilitiesModule)` and `NotificationsModule`, although the service injects nothing from them. Cycle: `StatisticModule` → `VulnerabilitiesModule` → `forwardRef(AgentsModule)` → `forwardRef(StatisticModule)`. Keep the `forwardRef`s.
- Imported by `reports` (report data and score), `search` (`getTotalAssets`, `getTotalTargets`) and `agents` (`forwardRef`).
- Notifications about discovery runs are produced downstream from `workflow.run.completed`, not here.

## Testing

`statistic.service.spec.ts`, `statistic.controller.spec.ts` (including a check that every route has the workspace permission guard), `statistic-cron.service.spec.ts`, `workspace-insights.spec.ts` (rules and `getAttention`).
