# vulnerabilities module

Findings on assets: list/detail/statistics, the lifecycle (new → active → fixed → resurfaced), dismissals and time-boxed risk acceptance, the review gate for AI-proposed findings, SLA settings, and AI analysis. The scanner **ingest** lives in `data-adapter/`, not here.

## Layout

- `vulnerabilities.controller.ts`: HTTP routes on `vulnerabilities`.
- `vulnerabilities.service.ts`: `VulnerabilitiesService`: `scan`, list/detail/timeline/statistics, bulk dismiss/reopen, `claimFix`, AI analysis enqueue and process.
- `vulnerability-lifecycle.service.ts`: `VulnerabilityLifecycleService`: auto-close on covering scans (`onScanJobCompleted`), `expireRiskAcceptances`, settings and `recomputeDueAt`.
- `vulnerability-review.service.ts`: `VulnerabilityReviewService`: `propose` (agents), `checkEvidence`, `approve`, `reject`, `bulkApprove`, `bulkReject`, `merge`, `duplicates`.
- `evidence-check.ts`: pure matcher for agent evidence (`checkCitations`, `findQuote`, `normalizeWhitespace`, `MIN_QUOTE_CHARS` = 8).
- `vulnerability-lifecycle.ts` (`scanScopeKey`, `stableJson`, `loadVulnerabilitySettings`, `insertInChunks`, `returnedRows`), `vulnerability-settings.ts` (`DEFAULT_VULNERABILITY_SETTINGS`, `computeDueAt`).
- `open-vulnerability.ts` (`openVulnerabilityCondition`, `approvedVulnerabilityCondition`, `fixedVulnerabilityCondition`), `vulnerability-status.ts` (`VulnerabilityStatus` list filter), `vulnerability-filter.ts` (filter tree), `detected-vulnerability.ts` (`toDetectedVulnerability`).
- `processors/vulnerability-analysis.processor.ts`, `vulnerability-risk-expiry.cron.ts`.

## Public surface

| Route | Permission |
|---|---|
| `GET vulnerabilities`, `statistics`, `activity`, `settings`, `:id`, `:id/timeline`, `:id/review/duplicates` | `vulnerability.read` |
| `POST scan`, `claim-fix`, `dismiss`, `reopen` | `vulnerability.write` |
| `POST :id/review/approve`, `:id/review/reject`, `:id/review/merge` | `vulnerability.write` |
| `POST review/approve`, `review/reject` (bulk, at most `BULK_REVIEW_MAX` = 200 ids) | `vulnerability.write` |
| `POST :id/analyze` (`forceRerun`), `DELETE :id/analyze` | `vulnerability.write` |
| `PUT settings` | `workspace.config` |

- `GET activity` (`getActivity`, dashboard feed) pages `vulnerability_events` of the whole workspace, newest first, optional `types[]` filter. It filters on both `e."workspaceId"` (index `IDX_vulnerability_events_workspaceId_occurredAt`) and the target join. Static routes like `activity` must stay above `:id`.
- Comment routes for findings live in the `comments` module.
- `@Global()`, exports `VulnerabilitiesService`, `VulnerabilityLifecycleService`, `VulnerabilityReviewService`.
- Events through `@PublishEvent`: `vulnerability.status.updated` (`dismiss` and `claim-fix`), `vulnerability.bulk_updated` (`reopen`), `vulnerability.settings.updated`, `vulnerability.review.approved|rejected|merged` (the bulk routes publish one event with `{ action: 'bulk', count, ids }` of the decided ids). Published from services: `vulnerability.proposed` (propose), `vulnerability.detected` (approve, so issue rules run on approved AI findings), `vulnerability.fixed` (auto-close), `vulnerability.analysis.completed` (processor, addressed to the requesting user). `vulnerability.dismissed`, `vulnerability.reopened`, `analysis.started` and `analysis.failed` are in the catalog, but nothing publishes them.
- BullMQ `VULNERABILITY_ANALYSIS` (`vulnerability-analysis`): job name = vulnerability id, data = the analysis payload plus `workspaceId` and `userId`, removed on complete and on fail.
- Cron `VulnerabilityRiskExpiryCron`: `5 * * * *`, `@Lock('cron:vulnerability-risk-expiry')`.
- Agent/MCP tools: `discover_vulnerabilities`, `investigate_vulnerability` (read, also on MCP). `propose_vulnerability` (agent mode only) calls `VulnerabilityReviewService.propose`.

## Data model

- `vulnerabilities`: unique `fingerprint`. FK to asset CASCADE, so findings disappear with their asset or target. `jobHistoryId`, `lastSeenJobHistoryId`, `fixedByJobHistoryId` SET NULL. No soft delete.
- Lifecycle columns: `detectionStatus` (`new|active|resurfaced|fixed`), `timesDetected`, `resurfacedCount`, `missedScans`, `scanScopeKey`, `fixedAt`, `fixClaimedAt/ById`, `dueAt`. Review columns: `reviewStatus` (default `approved`), `reviewedBy/At`, `reviewNote`, `discoveredBy`.
- `vulnerability_dismissals`: one per finding (unique `vulnerabilityId`, CASCADE). `expiresAt` is set only for `risk_accepted`.
- `vulnerability_events`: the timeline, CASCADE. It carries its own `workspaceId`. Rows are written on transitions and user actions only, never on each re-detection.
- `vulnerability_sources`: tool / AI agent / person provenance per finding (CASCADE). Merge moves these rows to the target finding.
- Settings are not a table: `workspaces.settings.vulnerabilityManagement` jsonb, merged over `DEFAULT_VULNERABILITY_SETTINGS`.

## Invariants

- **Tenant path is `vulnerability → asset → target.workspaceId`.** Every query joins it (`assertInWorkspace`, `findInWorkspace`, `findPending`). Another tenant's id gives 404.
- "Open" means approved, `detectionStatus IN (new, active, resurfaced)` and no **unexpired** dismissal. Every count (dashboard, reports, projects, targets, this list) must use `openVulnerabilityCondition`, so the numbers match across screens. An expired risk acceptance counts as open even before the cron deletes its row.
- AI proposals (`pending_review`, `rejected`) never count as findings. They show only under `status=pending_review|rejected`. Their fingerprints start with `ai-`, so they can never collide with a scanner fingerprint.
- Auto-close: only a later scan with the **same** `scanScopeKey` (asset + tool + service + inputs + config + profile) can count a miss. Findings with a null key (AI, manual, older rows) are never auto-closed, and a fix claim on them is recorded as `not_verifiable_by_scan`. `onScanJobCompleted` is called from `jobs-registry/processors/job-result.processor.ts`.
- Re-detection is the ingest's `ON CONFLICT ("fingerprint")` clause (`rescanConflictClause` in `data-adapter.service.ts`). It moves fixed → resurfaced and clears the fix and fix-claim columns. It never touches rows under review.
- Bulk review runs the single-id `approve`/`reject` per id, each in its own transaction. Ids missing from the workspace or no longer pending come back under `skipped`; any other error stops the batch and keeps what was already decided. Bulk approve keeps each proposed severity.
- The `PROPOSED` and `VERIFIED_BY_AI` events carry `data.proposalToolCallId`, the id of the `propose_vulnerability` call itself, and `data.evidenceVerdict`; the cited calls stay in `vulnerability_sources.toolCallIds`.
- **Evidence check.** `propose` looks up each `evidence.citations[]` `{runId, quote}` in the conversation's stored tool output (Redis `agent:tool-output:<conversationId>:<runId>`, key from `agents/tools/tool-output-store.ts`, 1 h TTL) and writes the result to the agent source's `evidence.check` (`verdict` `evidence_checked|unverified|output_expired`, per-citation `status`, `line`, `excerpt`). Matching is whitespace-normalized and case-sensitive. The check runs once, at propose time; the excerpt is what the reviewer sees after the output expires. It never blocks or changes the proposal, and the server's `check` always replaces one sent by the caller. No column: it lives in the `evidence` jsonb, so older rows simply have no `check`.
- Dismiss is only for approved findings, and an active dismissal gives 400. Risk acceptance needs a future `expiresAt` within `riskAcceptMaxDays`.

## Coupling

- `forwardRef` cycle with `AgentsModule`: `VulnerabilitiesService` → `AgentsCompletionsService.vulAnalyze` (analysis); agents → `VulnerabilityReviewService` (`propose_vulnerability`). `VulnerabilityReviewService` injects the global `RedisService` and reads the agents' tool-output keys (`toolOutputKey`).
- Imports `NotificationsModule`. Uses global `JobsRegistryService`, `WorkflowRunnerService`, `WorkflowsService`, `ToolsService`, `EventBridgeService`. Registers `Asset` and `Target` repositories itself.
- `scan` runs the first job of `vulnerability_scan_basic.yaml` (nuclei) for host targets, and the whole `repository_scan.yaml` for GIT_ORG targets. Both workflows must exist in the workspace, or the call returns 404.
- Writers outside: `DataAdapterService` inserts and upserts findings, `vulnerability_events` (`DETECTED`) and `vulnerability_sources`, and publishes `vulnerability.detected` / `vulnerability.resurfaced`.
- The list reads `issue_links` / `issues` with raw SQL (`openIssues`). The issues lane consumes `vulnerability.detected|resurfaced|fixed`. Projects, reports, statistic, search, comments and target overview all query `vulnerabilities` directly.

## Gotchas

- `analyzeVulnerability` sets `analyzeStatus = RUNNING` before it enqueues. A lost job leaves it RUNNING, and later calls get 400 unless `forceRerun` is sent. A `DONE` result is returned from the column without re-running.
- The analysis job payload carries vulnerability fields, not just ids. Keep it small.
- Raw `UPDATE … RETURNING` results go through `returnedRows`, because the pg driver returns `[rows, count]` for those.

## Testing

Unit specs: `evidence-check.spec.ts`, `vulnerabilities.service.spec.ts`, `vulnerability-activity.spec.ts`, `vulnerabilities.controller.spec.ts`, `vulnerability-lifecycle.service.spec.ts`, `vulnerability-review.service.spec.ts`, `vulnerability-filter.spec.ts`, `dto/vulnerability-dtos.spec.ts`, `vulnerabilities.lifecycle-api.spec.ts`. E2E: `core-api/test/vulnerability-lifecycle.e2e-spec.ts`, `vulnerability-fast-scan.e2e-spec.ts`.
