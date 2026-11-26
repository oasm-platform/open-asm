# reports module

PDF reports for a workspace: a summary (attack surface) report, a vulnerability report and a saved-query report. Each is a builtin template: a set of attack surface queries, a mapper from their results to the document's data, and a React PDF document rendered server-side with `@react-pdf/renderer` and stored in the `reports` bucket.

## Layout

- `reports.controller.ts`: routes under `reports`; builds the `QueryScope` (`reportScope`: workspace and permissions from the guard, `caller: 'report'`).
- `reports.service.ts`: `ReportsService` (list with presigned links, generate + upload, preview, delete). `render` = `ReportRunner.run` then `renderTemplatePdf`; `store` uploads and inserts the row.
- `report-runner.ts`: `ReportRunner.run(template, scope, options)`: reads the workspace name (`WorkspacesService.getWorkspacesByIds`, the guard already checked membership), runs each batch of `template.queries(options, now)` through `AttackSurfaceQueryService.run`, then `template.toData(results, ctx)`.
- `templates/registry.ts` (`BUILTIN_TEMPLATES`: `summary`, `vulnerability`, `query`), `templates/template.types.ts` (`BuiltinTemplate`), `templates/render.tsx` (`renderTemplatePdf`).
- `templates/builtin/<id>/`: `queries.ts` (the batches), `to-data.ts` (mapper), `data.type.ts`, the `*Document.tsx`, `index.ts` (the template object).
- `templates/shared/`: `asq-filters.ts` (`ReportOptions`, `findingFilters`, `open`), `batch-result.ts` (`rowsOf`, `num`), `severity-matrix.ts`, `report-header.ts` (`weekStart`, `riskLevel`, `trendStats`), `components/`, `theme.ts`, `fonts.ts`, `assets/*.ttf`.
- `entities/report.entity.ts`, `dto/reports.dto.ts`.

## Public surface

| Route | Permission | Event |
|---|---|---|
| `GET reports` | `report.read` | none |
| `GET reports/preview/summary` | `report.read` + `target.read`, `asset.read`, `vulnerability.read` | `report.exported` (metadata `format: pdf`) |
| `GET reports/preview/vulnerability` | `report.read` + `target.read`, `asset.read`, `vulnerability.read` | none |
| `POST reports/generate/summary` | `report.write` + the same catalog read keys | `report.generated` (metadata `reportType: summary`) |
| `POST reports/generate/vulnerability` | `report.write` + the same catalog read keys | none |
| `POST reports/generate/query` (`{ savedQueryId }`) | `report.write` + the read key of every resource the saved query reads | `report.generated` (metadata `reportType: query`) |
| `DELETE reports/:id` | `report.write` | `report.deleted` |

- The catalog read keys are enforced by ASQ, not by `@WorkspaceAccess`: the report runs as the member, so a missing key gives `PERMISSION_DENIED`, which `AsqErrorInterceptor` (on every route that runs a template) answers as 403 with body `{ error: { code, message } }`. Nothing is rendered or stored then.
- Registered in `combine.module.ts`. Exports nothing.
- Previews stream the PDF inline with `@Res()` and store nothing. Generate renders, uploads and inserts a `reports` row; the response is only a message, the file shows up in `GET reports`.
- Generation is synchronous inside the request: no queue, no worker.

## Data model

- `reports` (`Report`, extends `BaseEntity`): `workspaceId` (ManyToOne, CASCADE, no explicit column property), `userId` (CASCADE), `type` varchar `'SUMMARY' | 'VULNERABILITY' | 'QUERY'` (default `SUMMARY`), `path` = `reports/<fileName>`, `fileName` = `report-<type>-<token>-<ms>.pdf`. Hard delete. No schema change came with the templates.

## Invariants

- The scope is compiled by ASQ: every query is workspace-scoped and permission-checked there with `caller: 'report'` (in-process only, never from a request body; limits in `REPORT_SYNC`, see the ASQ AGENTS.md). The user filters (`targetIds`, `vulnIds`, dates, `minSeverity`) are `where` items on top of that scope, at most 1000 ids (more is `INVALID_QUERY`, 400).
- A failed query fails the report: `rowsOf` throws the `AsqError` of a batch entry that is `{ error }`, so nothing is uploaded and no `reports` row exists. The runner never swallows it. Exception: the `QUERY` template keeps per-table `{ error }` rendering (`toReportTables`), because those queries are user-authored.
- `ReportRunner` warns when a query came back `truncated`; the PDF is then missing rows.
- The security score is `StatisticService.calculateSecurityScore` (static), the same formula as the dashboard. Change it there, not here.
- Open findings only (`isOpen eq true`); the vulnerability list excludes `info`. Dismissed is `isDismissed` (unexpired dismissal) and not `fixed`.
- `renderTemplatePdf` adds `systemName`, `classification` and the logo (`public/images/logo.png` relative to `process.cwd()`, skipped if missing); mappers must not.
- `deleteReport` ignores storage errors and always removes the row.

## Coupling

- Imports `AttackSurfaceQueryModule` (`AttackSurfaceQueryService`, `AsqSavedQueriesService`) and `StorageModule`. Uses the global `WorkspacesService`. Imports `StatisticService` only as a static (`calculateSecurityScore`), no `StatisticModule`.
- Registers only the `Report` repository: no foreign repositories, no raw SQL over other modules' tables.
- Audit actions for these routes are in `audit/constants/audit-events.ts`.

## Gotchas

- Row caps: every list query is `limit` 10 000 at most (the `report` caller's `maxLimit`). `allVulnerabilities` and the per-target tables stop there; the runner logs a truncation warning. The new-port risk reads at most 10 000 open findings.
- Trend day buckets are UTC (the old service used the server's zone). `weekStart` is Monday 00:00 in the server's local time.
- `.tsx` files compile because `tsconfig.json` sets `jsx: react-jsx` and `nest-cli.json` builds with SWC including `.tsx`. Fonts load from `__dirname/assets` (`templates/shared/assets`); `nest-cli.json` copies `**/*.ttf`, so a font of another type needs a new asset glob.
- Unit specs `jest.mock` `./templates/render` and `./templates/registry` (the documents are not loadable in Jest); keep doing that. The e2e config maps `@react-pdf/renderer` to `test/stubs/react-pdf-renderer.js`, so e2e checks the data from `ReportRunner.run`, not the PDF bytes.

## Testing

Unit: `report-runner.spec.ts`, `reports.service.spec.ts`, `reports.service.routing.spec.ts` (right template per type), `reports.controller.spec.ts`, `reports.audit-wiring.spec.ts`, and per template `templates/builtin/*/{queries,to-data}.spec.ts`. E2E (live DB): `core-api/test/reports-builtin.e2e-spec.ts` (hand-computed summary and vulnerability numbers, tenant isolation, empty workspace, id limits, 403 for a member without `vulnerability.read`, a failing query stores nothing). No spec renders a real PDF.
