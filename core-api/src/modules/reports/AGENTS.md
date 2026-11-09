# reports module

PDF reports for a workspace: a summary (attack surface) report and a vulnerability report, rendered server-side with `@react-pdf/renderer` and stored in the `reports` bucket.

## Layout

- `reports.controller.ts`: routes under `reports`.
- `reports.service.ts`: `ReportsService` (list with presigned links, generate + upload, preview, delete).
- `services/summary-report.service.ts`, `services/vulnerability-report.service.ts`: build the data objects (`types/report-data.type.ts`, `types/vulnerability-report-data.type.ts`).
- `renderer/`: React PDF documents (`summary/SummaryReportDocument.tsx`, `vuln/VulnReportDocument.tsx`), shared `components/`, `theme.ts`, `helpers.ts`, `fonts.ts`, entry `pdf-renderer.tsx` (`renderReportPdf`).
- `renderer/assets/*.ttf`: Inter and JetBrains Mono fonts.
- `entities/report.entity.ts`, `dto/reports.dto.ts`.

## Public surface

| Route | Permission | Event |
|---|---|---|
| `GET reports` | `report.read` | none |
| `GET reports/preview/summary` | `report.read` | `report.exported` (metadata `format: pdf`) |
| `GET reports/preview/vulnerability` | `report.read` | none |
| `POST reports/generate/summary` | `report.write` | `report.generated` (metadata `reportType: summary`) |
| `POST reports/generate/vulnerability` | `report.write` | none |
| `DELETE reports/:id` | `report.write` | `report.deleted` |

- Registered in `combine.module.ts`. Exports nothing.
- Previews stream the PDF inline with `@Res()` and store nothing. Generate renders, uploads and inserts a `reports` row; the response is only a message, the file shows up in `GET reports`.
- Generation is synchronous inside the request: no queue, no worker.

## Data model

- `reports` (`Report`, extends `BaseEntity`): `workspaceId` (ManyToOne, CASCADE, no explicit column property), `userId` (CASCADE), `type` varchar `'SUMMARY' | 'VULNERABILITY'` (default `SUMMARY`), `path` = `reports/<fileName>`, `fileName` = `report-<type>-<token>-<ms>.pdf`. Hard delete.

## Invariants

- The `reports` bucket is `private` in `StorageService`. `getMany` presigns each row's download URL on every list call (`contentType: application/pdf`, attachment with the file name); never return `path` as a URL.
- Every query is scoped by workspace: the row lookup by `{ id, workspace: { id } }` (404 otherwise) and the vulnerability data through `asset → target → workspace` joins (`applyWorkspaceFilter`). Filters `targetIds` / `vulnIds` are applied on top of that scope, not instead of it.
- Report data counts open findings only (`openVulnerabilityCondition`); the vulnerability report's full list excludes `info`.
- The security score comes from `StatisticService.calculateSecurityScore`, the same formula as the dashboard. Change it there, not here.
- `renderReportPdf` adds `systemName` and `classification` itself; the logo is read once from `public/images/logo.png` (relative to `process.cwd()`) and silently skipped if missing.
- `deleteReport` ignores storage errors and always removes the row.

## Coupling

- Imports `StatisticModule` (uses `getCountForWorkspace`, `getSeverityCounts`, `getVulnerabilityTrends`, `getTopAssetsWithVulnerabilities`, `getTargetVulnerabilityStats`) and registers repositories for `Vulnerability`, `Target`, `AssetService`, `AssetTag`, `Workspace` to query those tables directly.
- Uses the global `StorageService`. Audit actions for these routes are listed in `audit/constants/audit-events.ts`.

## Gotchas

- `.tsx` files compile because `tsconfig.json` sets `jsx: react-jsx` and `nest-cli.json` builds with SWC including `.tsx`. Fonts are loaded from `__dirname/assets`, which works in `dist` only because `nest-cli.json` copies `**/*.ttf` as assets. Adding a font of another type needs a new asset glob.
- Jest needs `@react-pdf` and `react` in `transformIgnorePatterns` (already set in `package.json`). Every spec here `jest.mock`s `./renderer/pdf-renderer`; keep doing that in new specs.
- `getAllVulnerabilities` has no row limit: it loads every open non-info finding with asset and tool into memory and into the PDF.

## Testing

`reports.service.spec.ts`, `reports.controller.spec.ts`, `reports.audit-wiring.spec.ts` (asserts the `@PublishEvent` metadata per handler). No spec renders a real PDF or covers the data services in `services/`.
