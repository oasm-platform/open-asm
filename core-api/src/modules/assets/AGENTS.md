# assets module

Read side of the attack surface: hosts (`assets`), their open ports (`asset_services`), and the HTTP, TLS, tech, IP and DNS facts scans recorded about them. Also manual tags, AI tag suggestions, enable/disable, re-scan and URL discovery.

## Layout

- `assets.controller.ts`: HTTP routes on `assets`, including the CSV export built in the controller.
- `assets.service.ts`: `AssetsService` (~2.2k lines): list/facet queries, graph, TLS, tags, toggle, `reScan`, `createPrimaryAsset`, AI tags.
- `url-discovery.service.ts`: `UrlDiscoveryService`: starts the `url_discovery` workflow and publishes `asset.url.discovered` when a run ends.
- `asset-filter.ts`: filter-tree schema for the list (`compileAssetFilter`, `legacyParamsToFilter`, fields `host|port|ip|tech|url|statusCode|tlsHost|tag|project|isNew`).
- `fresh-runs.ts`: the single definition of "new" rows (`findFreshRuns`, `freshRunSql`, `isFresh`).
- `entities/`: one file per table (see Data model). `dto/`: query/response DTOs, `graph.dto.ts`, `tls.dto.ts`.

## Public surface

| Route | Permission |
|---|---|
| `GET assets` (asset **services**, paginated, filter tree), `GET assets/:id` | `asset.read` |
| `GET assets/ip`, `/host`, `/port`, `/url`, `/tech`, `/status-code`, `/tls`, `/tags` (facets) | `asset.read` |
| `GET assets/graph`, `GET assets/:assetId/services` (lazy graph expand) | `asset.read` |
| `GET assets/services/export` (CSV) | `asset.read` |
| `PATCH assets/:id` (tags only), `POST assets/toggle`, `POST assets/service/tag/generate`, `POST assets/url/discover` | `asset.write` |

- `@Global()`, exports `AssetsService` only (`UrlDiscoveryService` is internal).
- No `@PublishEvent` on any route. `UrlDiscoveryService.handleRunEnd` (`@OnEvent(EventTriggerType.WORKFLOW_END)`) publishes `asset.url.discovered` for `url_discovery` runs. `reScan` emits in-process `target.<type>.re-scan` (with `{ jobRunType }` as a third argument), or `target.git_org.re-scan` for GIT_ORG targets.
- MCP/agent tools in `agents/tools/workspace.tools.ts`: `enumerate_assets`, `inspect_asset`, `examine_target_assets`, `list_network_ports`, `fingerprint_technologies`, `verify_tls_settings`. They call `getManyAsssetServices` (note the triple "s"), `getAssetById`, `getPortAssets`, `getTechnologyAssets`, `getManyTls`.

## Data model

- `assets`: unique `(value, target)`; `isPrimary` (the target's own host, or the first IP of a CIDR); `isEnabled` (disabled assets are kept but not scanned); `metadata` jsonb (`RepositoryAssetMetadata` for GIT_ORG repositories); `dnsRecords` json (legacy) next to the `dns_records` table. FK to target CASCADE; `jobHistoryId` SET NULL (provenance only).
- `asset_services`: unique `(assetId, port)`; `isErrorPage`, `screenshotPath`. Cascades from asset.
- `asset_services_tags` (`AssetTag`): `tag`, `assetServiceId` CASCADE, optional `toolId`.
- `http_responses`: many per service; "latest" = newest `createdAt` (index `IDX_http_responses_assetServiceId_createdAt`). `tls`, `tech`, `a`, `resolvers`… on the entity are **not columns**. They are ingest-only fields that `DataAdapterService` splits into `tls_certificates` (unique per response), `http_response_technologies` (unique `(httpResponseId, name, version)`), `ip_observations` (inet, partial uniques per http/asset source), `http_status_codes` (primary + redirect chain).
- `discovered_urls`: unique `(assetServiceId, url)`; `dns_records`: unique `(assetId, recordType, value)`; `ports` (array column; its asset relation is commented out, so there is no FK to assets).
- Cascade asymmetry: deleting a `job_histories` row **deletes** its `http_responses`, `discovered_urls` and `ports`, but only nulls `assets.jobHistoryId` / `asset_services.jobHistoryId`.
- No soft delete anywhere. There is no delete route; assets go away only with their target.

## Invariants

- Tenant scope is `asset → target.workspaceId`, and `asset_service → asset → target.workspaceId` for services. `buildBaseQuery` applies it to every list and facet; single-row methods join `target` and filter on `workspaceId`. `getAllAssetsByTargetId` and `createPrimaryAsset` take no workspace and have no callers. Add a workspace check before you wire either to a route.
- **Ids differ by route**: `GET/PATCH assets/:id` and `service/tag/generate` take an `asset_services.id`; `POST assets/toggle` and `GET assets/:assetId/services` take an `assets.id`. The list rows are services, not hosts.
- `PATCH assets/:id` replaces all tags of the service (delete then insert), and returns the parent `Asset`.
- `isNew` and the "new" badges both go through `freshRunSql`: a row is new while the completed run that found it is the latest completed run of that workflow on that target.
- List ordering always adds `asset_service.id` as a tie-breaker. Keep it, or offset pages repeat or skip rows.

## Coupling

- Imports `TechnologyModule` (tech enrichment) and `WorkspacesModule`. Uses global `StorageService`, `GeoIpService`, `WorkspaceEncryptionService`, `WorkflowsService`, `WorkflowRunnerService` and `EventBridgeService`. Registers the `Job`, `Target`, `AgentLLMConfig` and `AgentConfig` repositories itself.
- Users of `AssetsService`: `TargetsService` (and `POST targets/:id/re-scan`), `AssetsDiscoveryScheduleConsumer` (`reScan`), `projects` (`ProjectAssetsService`, `ProjectsController`), `SearchService`, agents tools.
- Writers of these tables outside the module: `DataAdapterService` (`data-adapter/`) ingests every scan result into `assets`, `asset_services`, `http_responses` and the child tables. `TargetsService.createMultipleTargets` inserts the primary/CIDR assets. `RepositorySyncService` creates GIT_ORG repository assets. `step-scope.loader.ts`, `StatisticService` and the reports read them directly.
- `project_assets` (projects module) cascades from `assets`.

## Gotchas

- `generateServiceTags` only **returns** suggestions and stores nothing, although its Swagger text says it replaces tags. It uses the workspace/user default LLM config (`findDefaultLLMConfig`), `generateText`, and the prompt `agents/prompts/GENERATE_SERVICE_TAGS.md`, which the constructor loads from disk.
- Catalog events `asset.updated` and `asset.enabled_changed` have no publisher. The audit mapping `asset.deleted` → `AssetsController.deleteAsset` points at a method that does not exist.
- Tech strings on list rows are `name:version`. See `technology/AGENTS.md` for why those miss the enrichment cache.
- `POST assets/url/discover` accepts DOMAIN targets only, and returns a message (not an error) when no live HTTP service has been found yet.

## Testing

Unit specs: `assets.service.spec.ts`, `assets.controller.spec.ts`, `url-discovery.service.spec.ts`, `asset-filter.spec.ts`, `fresh-runs.spec.ts`, `dto/assets-filter.dto.spec.ts`, `entities/discovered-url.entity.spec.ts`. E2E (live DB): `core-api/test/assets-facets.e2e-spec.ts`, `assets-filter.e2e-spec.ts`, `assets-url.e2e-spec.ts`.
