# data-adapter module

Ingest layer for scan results: turns a finished job's tool output into rows in the asset, service, HTTP, URL and vulnerability tables. It owns no tables of its own.

## Layout

- `data-adapter.service.ts`: `DataAdapterService` plus exported pure helpers (`mergeDnsRecords`, `toDnsFacetRows`, `vulnerabilityFingerprint`, `rescanConflictClause`, `splitTechString`, `toTlsCertificateRow`, `VULNERABILITY_INSERT_CHUNK_SIZE`).
- `url-owner.ts`: `serviceForUrl`, picks the `asset_services` row a discovered URL belongs to when the job ran on a whole host.
- `data-adapter.interface.ts`: `DataAdapterInput<T>` (`{ data, job }`).
- Specs: `data-adapter.service.spec.ts`, `url-owner.spec.ts`, `vulnerability-fingerprint.spec.ts`.

## Public surface

- No HTTP routes, no gRPC, no queues. Registered in `combine.module.ts` and imported by `JobsRegistryModule` and `IntegrationsModule`; exports `DataAdapterService`.
- `syncData({ job, data })` is the entry point. It dispatches on `job.category` (`ToolCategory`): `PORTS_SCANNER` → `portsScanner`, `SUBDOMAINS` → `subdomains`, `HTTP_PROBE` → `httpResponses`, `VULNERABILITIES` → `vulnerabilities`, `SCREENSHOT` → `screenshot`, `URL_DISCOVERY` → `urlDiscovery`. Any other category throws. Only `SCREENSHOT` runs class-validator (`ScreenshotPayload`).
- `upsertAssetsByTargetId(targetId, assets, isEnabled?, { replaceDnsRecords, jobHistoryId })` is also called directly by integration connectors.
- Events published (global `EventBridgeService.publishSafely`, always after the commit):
  - `asset.discovered` (`AssetDiscoveredPayload`, only the ids that were new to the target).
  - `vulnerability.detected` for new findings and `vulnerability.resurfaced` for fixed → resurfaced, one event per batch, never one per finding.

## Data model (tables it writes)

- `assets` (insert `.orIgnore()` on `(value, targetId)`, or `.orUpdate(['dnsRecords'])` with `replaceDnsRecords`), `dns_records` and DNS-sourced `ip_observations` (deleted and re-inserted per asset so they mirror the `dnsRecords` json, see `syncDnsFacets`).
- `ports` (plain insert, one row per run, no dedupe) and `asset_services` (upsert on `(assetId, port)`, overwrites `value` only, so a service keeps the run that first found it).
- `http_responses` plus facet tables `tls_certificates` (upsert on `httpResponseId`), `http_response_technologies`, `ip_observations` (`httpx_a` / `resolver`), `http_status_codes`. The facet keys (`HTTP_RESPONSE_FACET_KEYS`) are stripped from the `http_responses` row. A `failed` probe sets `asset_services.isErrorPage`.
- `discovered_urls` (unique `(assetServiceId, url)`, `.orIgnore()`, URLs over 2048 chars dropped).
- `vulnerabilities`, `vulnerability_sources`, `vulnerability_events`, and `project_vulnerabilities` (raw SQL upsert when the run has a `projectId`).
- `asset_services.screenshotPath` after uploading the PNG to the `screenshot` bucket.
- Tenant columns (see `assets/AGENTS.md`): writes `workspaceId` itself where it has it (assets and DNS facets from `getWorkspaceIdByTargetId`, services from `job.asset`, HTTP facets from `job.assetService`, vulnerabilities from the resolved workspace); the `asq_fill_scope` triggers fill the rest. `portsScanner` overwrites `value` and `lastSeenAt` on conflict; `upsertAssetsByTargetId` bumps `assets.lastSeenAt` for the whole batch; `httpResponses` points `asset_services.latestHttpResponseId` at the new response unless a later probe already landed, and bumps `lastSeenAt`.

## Invariants

- **Vulnerability dedupe key is `fingerprint`** = md5 of `name-assetId-toolId`. Only repository assets (`TargetType.GIT_ORG`) append the connector's own `fingerprint`; for host findings any incoming `fingerprint` is ignored so legacy rows keep matching. Changing this formula re-creates every finding.
- `LIFECYCLE_FIELDS` (detection status, review, fix claim, SLA `dueAt`, `analyze*`, `sources`...) are deleted from connector payloads. The platform stamps them; a connector can never set them.
- Re-detection runs through `rescanConflictClause`: refreshes `RESCAN_OVERWRITE_COLUMNS`, resets `missedScans`, counts `timesDetected` once per run, moves new/resurfaced → active and fixed → resurfaced (clears fix fields, restarts `dueAt` only when `slaRestartOnResurface`). The `WHERE reviewStatus = 'approved'` means AI proposals under review are never touched.
- Columns the incoming finding leaves null keep the stored value (`RESCAN_PRESERVE_COLUMNS` pre-read), because `EXCLUDED` would otherwise wipe them.
- Code-finding fields (`lineStart`, `commit`, `packageName`...) arrive as `''`/`0` from proto3 defaults and are stored as NULL (`normalizeCodeFields`).
- Bulk inserts are chunked to stay under Postgres' 65535 bind-parameter cap: 500 rows for vulnerabilities, 5000 for URLs and DNS facets. Keep chunking when adding columns.
- `upsertAssetsByTargetId` resolves ids by `value` after the insert; `insertResult.identifiers` does not line up with the input under `.orIgnore()`.
- The primary asset's `dnsRecords` are merged (never replaced) unless `replaceDnsRecords`; if the apex is missing from the batch the primary row is left alone.
- `isEnabled` of new assets defaults to the workspace config `isAutoEnableAssetAfterDiscovered`.
- Events are published only after commit, so consumers can read the rows. A job whose workspace cannot be resolved writes rows but publishes nothing.

## Coupling

- Callers: `jobs-registry/processors/job-result.processor.ts` (`syncData`, only when `job.isSaveData`), and the AWS and Cloudflare connectors in `integrations/connectors/` (`upsertAssetsByTargetId` with `replaceDnsRecords: true`, via `integrations-sync.service.ts`).
- Imports `WorkspacesModule` and `StorageModule`; uses the global `EventBridgeService`. Writes `assets`/`vulnerabilities` entities directly through `DataSource`, not through `AssetsService` or `VulnerabilitiesService`.
- Reuses lifecycle helpers from `vulnerabilities/vulnerability-lifecycle.ts` (`insertInChunks`, `loadVulnerabilitySettings`, `scanScopeKey`) and `vulnerability-settings.ts` (`computeDueAt`). Changes to the vulnerability lifecycle must stay in step with this file.

## Gotchas

- Screenshot object keys are `md5(asset.value).png`, so the same host in two workspaces shares one object. `StorageController` authorizes a screenshot read for a member of any owning workspace.
- `urlDiscovery` on a job without `assetServiceId` attaches each URL through `serviceForUrl` (own port, else 443, 80, lowest port). With no services on the host it logs and writes nothing.
- `portsScanner` adds a new `ports` row on every run; it is history, not a deduped set.

## Testing

`data-adapter.service.spec.ts` is large and mocks `DataSource`/query runners; the SQL of `rescanConflictClause` and the per-category routing are asserted there. Run with `task api:test:one SPEC=src/modules/data-adapter/data-adapter.service.spec.ts`.
