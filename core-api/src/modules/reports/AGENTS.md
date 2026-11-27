# reports module

PDF reports for a workspace: a summary (attack surface) report, a vulnerability report and a saved-query report. Each is a builtin template: a set of attack surface queries, a mapper from their results to the document's data, and a React PDF document rendered server-side with `@react-pdf/renderer`. Generation is queued (BullMQ), and the PDF is stored as a workspace artifact (`source: 'report'`), so it counts against the storage quota.

## Layout

- `reports.controller.ts`: routes under `reports`; builds the `QueryScope` (`reportScope`: workspace and permissions from the guard, `caller: 'report'`).
- `reports.service.ts`: `ReportsService` (list with presigned links, enqueue, `runJob`, schedules + `runSchedule`, preview, delete). `render` = `ReportRunner.run` then `renderTemplatePdf`; `store` puts the PDF in the `reports` workspace folder (`ArtifactFoldersService.ensureWorkspaceFolder`) through `ArtifactsService.createFromBuffer` and inserts the row (deletes the artifact if the insert fails).
- `report.processors.ts`: `ReportGenerateProcessor` (`REPORT_GENERATE`, `report-generate`) and `ReportScheduleProcessor` (`REPORT_SCHEDULE`, `report-schedule`), both concurrency 1, `attempts: 1`.
- `report-runner.ts`: `ReportRunner.validate(template, scope, options)` (ASQ `validate` on every batch, no DB) and `ReportRunner.run(template, scope, options)`: reads the workspace name (`WorkspacesService.getWorkspacesByIds`, the guard already checked membership), runs each batch of `template.queries(options, now)` through `AttackSurfaceQueryService.run`, then `template.toData(results, ctx)`.
- `templates/registry.ts` (`BUILTIN_TEMPLATES`: `summary`, `vulnerability`, `query`), `templates/template.types.ts` (`BuiltinTemplate`), `templates/render.tsx` (`renderTemplatePdf`).
- `templates/builtin/<id>/`: `queries.ts` (the batches), `to-data.ts` (mapper), `data.type.ts`, the `*Document.tsx`, `index.ts` (the template object).
- `templates/shared/`: `asq-filters.ts` (`ReportOptions`, `findingFilters`, `open`), `batch-result.ts` (`rowsOf`, `firstError`, `num`, `at`, `str`, `strArray`), `severity-matrix.ts`, `report-header.ts` (`weekStart`, `riskLevel`, `trendStats`), `components/`, `theme.ts`, `fonts.ts`, `assets/*.ttf`.
- `entities/report.entity.ts`, `entities/report-schedule.entity.ts`, `dto/reports.dto.ts`.

## Public surface

| Route | Permission | Event |
|---|---|---|
| `GET reports` | `report.read` | none |
| `GET reports/preview/summary` | `report.read` + `target.read`, `asset.read`, `vulnerability.read` | `report.exported` (metadata `format: pdf`) |
| `GET reports/preview/vulnerability` | `report.read` + `target.read`, `asset.read`, `vulnerability.read` | none |
| `POST reports/generate/summary` (202) | `report.write` + the same catalog read keys | `report.generated` (metadata `reportType: summary`) |
| `POST reports/generate/vulnerability` (202) | `report.write` + the same catalog read keys | none |
| `POST reports/generate/query` (`{ savedQueryId }`, 202) | `report.write` + the read key of every resource the saved query reads | `report.generated` (metadata `reportType: query`) |
| `DELETE reports/:id` | `report.write` | `report.deleted` |
| `GET reports/schedules` | `report.read` | none |
| `POST reports/schedules` (`type`, `cron` UTC, `targetIds?`, `minSeverity?`) | `report.write` + the catalog read keys | none |
| `DELETE reports/schedules/:id` | `report.write` | none |

- The catalog read keys are enforced by ASQ, not by `@WorkspaceAccess`: the report runs as the member, so a missing key gives `PERMISSION_DENIED`, which `AsqErrorInterceptor` (on every route that runs a template) answers as 403 with body `{ error: { code, message } }`. Nothing is rendered or stored then.
- Registered in `combine.module.ts`. Exports nothing.
- Previews stream the PDF inline with `@Res()` and store nothing.
- Generate validates the template's queries as the caller (`ReportRunner.validate`, so 403 `PERMISSION_DENIED` / 400 `INVALID_QUERY` stay synchronous), then queues a `ReportJob` with a snapshot of the caller's permissions and answers 202. `report.generated` therefore means "requested".
- `runJob` never throws (a retry would reuse stale permissions): it publishes `report.completed` (not persisted) with `outcome` success/failure and payload `{ userId, reportType, fileName?, error? }`. The notifications lane turns it into `REPORT_GENERATED` / `REPORT_FAILED` for that user (`notification-rules.ts`, link `/reports`). A full quota (409 `STORAGE_QUOTA_EXCEEDED` from artifacts) is a failure notification.
- `report.completed`'s `error` is only the message of a domain error, an `AsqError` or a 4xx Nest exception (`userFacingError`); anything else reads `Report generation failed` and the raw message stays in the log.
- Schedules: one BullMQ job scheduler per row, id `report-schedule:<id>`, upserted on create (the row is deleted again if the upsert fails), removed on delete. `onApplicationBootstrap` runs `reconcileSchedules`: re-upserts every row and removes schedulers without a row (it lists schedulers *before* reading rows, so a schedule created meanwhile is never taken for an orphan). `runSchedule` loads the owner's permissions *at fire time* (`WorkspacesService.getMembershipWithPermissions`); a missing row or an owner who left the workspace removes the scheduler (and the row). No edit: edit = delete + create.

## Data model

- `reports` (`Report`, extends `BaseEntity`): `workspaceId` (ManyToOne, CASCADE, no explicit column property), `userId` (CASCADE), `type` varchar `'SUMMARY' | 'VULNERABILITY' | 'QUERY'` (default `SUMMARY`), `fileName` = `report-<type>-<token>-<ms>.pdf`, nullable `artifactId` (FK `artifacts`, CASCADE), `path` = `artifacts/<objectKey>` (older rows: `reports/<fileName>`, `artifactId` null, never charged to the quota). Hard delete: with an artifact, `deleteReport` calls `ArtifactsService.deleteServerFile` (frees the quota), without one it deletes the object in `reports`. Deleting the file in Files removes the report row by cascade.
- `report_schedules` (`ReportSchedule`): `workspaceId` (CASCADE), `userId` = owner (CASCADE), `type` `'SUMMARY' | 'VULNERABILITY'`, `options` jsonb (`targetIds`, `minSeverity`; no dates, every run covers all data), `cron` (5-field, UTC, validated by `IsCronSchedule` from projects, `disabled` refused, and the minute field must be one number, so at most hourly: each run stores a PDF against the quota and holds the single schedule worker).

## Invariants

- The scope is compiled by ASQ: every query is workspace-scoped and permission-checked there with `caller: 'report'` (in-process only, never from a request body; limits in `REPORT_SYNC`, see the ASQ AGENTS.md). The user filters (`targetIds`, `vulnIds`, dates, `minSeverity`) are `where` items on top of that scope, at most 1000 ids (more is `INVALID_QUERY`, 400).
- A failed query fails the report: `rowsOf` throws the `AsqError` of a batch entry that is `{ error }`, so nothing is uploaded and no `reports` row exists. The runner never swallows it. Exception: the `QUERY` template keeps per-table `{ error }` rendering (`toReportTables`), because those queries are user-authored.
- `ReportRunner` warns when a query hit its row cap (see Gotchas); the PDF is then missing rows.
- The security score is `StatisticService.calculateSecurityScore` (static), the same formula as the dashboard. Change it there, not here.
- Open findings only (`isOpen eq true`); the vulnerability list excludes `info`. Dismissed is `isDismissed` (unexpired dismissal) and not `fixed`.
- `renderTemplatePdf` adds `systemName`, `classification` and the logo (`public/images/logo.png` relative to `process.cwd()`, skipped if missing); mappers must not.
- `deleteReport` ignores storage errors and always removes the row.

## Coupling

- Imports `AttackSurfaceQueryModule` (`AttackSurfaceQueryService`, `AsqSavedQueriesService`), `ArtifactsModule` (`ArtifactsService`: quota + upload, `ArtifactFoldersService`: the `reports` folder) and `StorageModule`. Uses the global `WorkspacesService` and `EventBridgeService`. Imports `IsCronSchedule` from `projects/dto/cron-schedule.validator.ts`. Imports `StatisticService` only as a static (`calculateSecurityScore`), no `StatisticModule`.
- Registers only the `Report` and `ReportSchedule` repositories: no foreign repositories, no raw SQL over other modules' tables.
- Audit actions for these routes are in `audit/constants/audit-events.ts`.

## Gotchas

- Row caps: every list query is `limit` 10 000 at most (the `report` caller's `maxLimit`). `allVulnerabilities` and the new-port risk list stop there. A list cut at its limit returns `nextCursor` (`truncated` only flags string cuts and the response budget), a grouped query (`targets`, `byTarget`, `discoveryRisk`) returns exactly `limit` rows. `ReportRunner.warnCapped` logs all three. The `QUERY` template clamps explicit limits to `QUERY_REPORT_MAX_ROWS + 1`.
- Reports share ASQ's process-wide connection semaphore (`ASQ_MAX_CONNECTIONS`, 3; `BUSY` after a 2 s wait) with interactive and agent queries. A report holds a slot for a whole consistent batch (summary: two in a row), so a few concurrent reports can starve queries.
- After a timeout inside a consistent batch the later statements fail with `25P02` (`INTERNAL`). `firstError` (summary and vulnerability `toData`) throws the first error in execution order so the real `QUERY_TIMEOUT` surfaces.
- Trend day buckets are UTC (the old service used the server's zone). `weekStart` is Monday 00:00 in the server's local time.
- `.tsx` files compile because `tsconfig.json` sets `jsx: react-jsx` and `nest-cli.json` builds with SWC including `.tsx`. Fonts load from `__dirname/assets` (`templates/shared/assets`); `nest-cli.json` copies `**/*.ttf`, so a font of another type needs a new asset glob.
- Unit specs `jest.mock` `./templates/render` and `./templates/registry` (the documents are not loadable in Jest); keep doing that. The e2e config maps `@react-pdf/renderer` to `test/stubs/react-pdf-renderer.js`, so e2e checks the data from `ReportRunner.run`, not the PDF bytes.

## Testing

Unit: `report-runner.spec.ts`, `reports.service.spec.ts` (queueing, `runJob` events, schedules, artifact delete), `reports.service.routing.spec.ts` (right template per type, artifact storage), `reports.controller.spec.ts`, `reports.audit-wiring.spec.ts`, `dto/reports.dto.spec.ts` (schedule cron), and per template `templates/builtin/*/{queries,to-data}.spec.ts`. E2E (live DB): `core-api/test/reports-builtin.e2e-spec.ts` (hand-computed summary and vulnerability numbers, tenant isolation, empty workspace, id limits, 403 for a member without `vulnerability.read`, a failing query stores nothing). No spec renders a real PDF.
