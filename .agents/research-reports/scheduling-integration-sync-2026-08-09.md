# Research Report: Scheduling + Background Jobs for Periodic Cloudflare Asset Sync

## Meta
- Date: 2026-08-09. Depth: full read of queue/producer/consumer/worker path. Sources: codebase (T2) only — all findings are file:line citations.
- Original question: how to add "periodic Cloudflare asset sync" recurring jobs (per integration, user-chosen cron) to Open-ASM.
- Versions: `@nestjs/bullmq ^11.0.4`, `bullmq ^5.65.1`, `@nestjs/schedule ^6.1.0` (core-api/package.json:37,45,58). No lockfile in repo (root or core-api) to pin installed version.

## 1. BullMQ queue registration map

| Queue (BullMQName) | Registration | Producer (`@InjectQueue`) | Consumer (`@Processor`) | Status |
|---|---|---|---|---|
| `assets-discovery-schedule` (enum.ts:127) | targets.module.ts:18-20 | TargetsService — targets.service.ts:36 | `AssetsDiscoveryScheduleConsumer` — scan-schedule.processor.ts:10 | **ACTIVE** |
| `asset-groups-workflow-schedule` (enum.ts:128) | asset-group.module.ts:19 | AssetGroupService — asset-group.service.ts:47 | `AssetGroupsScheduleConsumer` — scan-schedule.processor.ts:22 | **ACTIVE** |
| `job-result` (enum.ts:130) | jobs-registry.module.ts:33-35 | JobsRegistryService — jobs-registry.service.ts:100 | `JobResultProcessor` — job-result.processor.ts:24 | **ACTIVE** |
| `notification` (enum.ts:129) | notifications.module.ts:18 | NotificationsService — notifications.service.ts:19 | `NotificationsProcessor` — notifications.processor.ts:32 | ACTIVE |
| `issue-creation` (enum.ts:131) | issues.module.ts:18 | IssuesService — issues.service.ts:45 | `IssueCreationProcessor` — issue-creation.processor.ts:20, **never registered** (jobs-registry.module.ts:47 commented out) | **DEAD consumer** |
| `vulnerability-analysis` (enum.ts:132) | vulnerabilities.module.ts:20 | VulnerabilitiesService — vulnerabilities.service.ts:45 | `VulnerabilityAnalysisProcessor` — vulnerability-analysis.processor.ts:18 | ACTIVE |

**`assets-discovery-schedule` is NOT dead** — producer + consumer both present:
- Producer add() — targets.service.ts:615-623:
  ```
  await this.scanScheduleQueue.add(
    target.id, // Job name is the target ID
    { id: target.id } as Target,
    { repeat: { pattern: scanSchedule } },
  );
  ```
- Consumer process() — scan-schedule.processor.ts:16-19: `async process(job: Job<Target>): Promise<void> { const targetId = job.data.id; await this.assetService.reScan(targetId); }`

Both schedule queues are registered twice (in targets.module + asset-group.module) but share one Redis-backed queue; both consumers are WorkerHost providers in the @Global JobsRegistryModule (jobs-registry.module.ts:43-44).

## 2. Recurring-job lifecycle (asset-group.service.ts + targets.service.ts)

Pattern is identical in both services; targets is the canonical one:
- (a) Add repeat job: `updateTargetScanScheduleJob` — targets.service.ts:606-628. Removes existing scheduler first (L611-613 `if (target.jobId) { await this.scanScheduleQueue.removeJobScheduler(target.jobId); }`), then `queue.add(target.id, { id }, { repeat: { pattern } })` only when `scanSchedule !== CronSchedule.DISABLED` (L614).
- (b) Persist repeatJobKey: caller `updateTarget` stores `jobId = job.repeatJobKey` into the entity's `jobId` column — targets.service.ts:577-593 (`await this.repo.update(id, { ...dto, jobId })`). Same in asset-group: `jobId = job.repeatJobKey ?? null` (asset-group.service.ts:538) saved to `asset_group_workflows.jobId` (L546).
- (c) Remove scheduler: `removeJobScheduler(repeatJobKey)` — targets.service.ts:612; asset-group.service.ts:400/685/772 (bulk `.map(...)` on entity `jobId` lists), 952-956 (update path), and `removeGroupWorkflowScheduler` wrapper at asset-group.service.ts:1072-1079.
- (d) Update path (asset-group.service.ts:949-975): on schedule change → remove old scheduler (L953), re-add (L959-967), overwrite `jobId = newJob.repeatJobKey` (L969); on `'disabled'` → drop `jobId = null` (L974).
- (e) Boot backfill: `handleUpdateScanSchedule` — targets.service.ts:633-653, runs at `onModuleInit` (targets.service.ts:40-41): selects rows `WHERE scanSchedule IS NOT NULL AND jobId IS NULL`, re-adds jobs, persists `job.repeatJobKey` (L650). Asset-group has no equivalent backfill (its rows are written through the service only).
- Validation: `cron-schedule.validator.ts` — `isValidCronSchedule` (L51-59) accepts **any 5-field cron expression or the literal `'disabled'`**; `@IsCronSchedule()` decorator (L75-77) used on `schedule` in create-asset-group.dto.ts:57 and update-asset-group-workflow.dto.ts:16. Comment L21-25: intentionally mirrors cron-parser (what BullMQ uses for repeat patterns) so invalid crons fail at DTO validation, not at queue.add time. CronSchedule enum (enum.ts:80-92) is just 6 presets — validator is not restricted to them.

**Note**: user context said `queue.add(job, { repeat: { pattern }, jobId })` — actual code passes **no `jobId` option**; the **job NAME is the entity id** (`target.id`), which is the v5 idempotency key for repeat jobs (same name+pattern → same repeat job).

## 3. Targets scanSchedule flow

- Column: `target.scanSchedule` (target.entity.ts:109) + `target.jobId` (L111-112, nullable, holds repeatJobKey); composite index `IDX_targets_scanSchedule_jobId` (L33).
- DTO: `scanSchedule?: CronSchedule` — targets.dto.ts:171 (create at :110).
- Read + (re)add: `updateTarget` (targets.service.ts:579-587) → `updateTargetScanScheduleJob` (L606-628, quoted §2) → persist `repeatJobKey`.
- Backfill: `handleUpdateScanSchedule` (L633-653) at `onModuleInit` (L40-41).
- **Gap**: `deleteTarget` (targets.service.ts:542-560) deletes the DB row but never calls `removeJobScheduler` — orphaned repeat jobs keep ticking for deleted targets. The asset-group consumer guards against this (orphan → remove scheduler, scan-schedule.processor.ts:39-50), but `AssetsDiscoveryScheduleConsumer` has **no such guard** — `reScan` (assets.service.ts:411) would throw NotFoundException and the repeat job would fail/retry every tick.

## 4. End-to-end: scheduled tick → worker run → result

1. **Tick**: BullMQ repeat job (pattern from DB) lands on `asset-groups-workflow-schedule` / `assets-discovery-schedule` → `AssetGroupsScheduleConsumer.process` — scan-schedule.processor.ts:28-34 → `assetGroupService.runGroupWorkflowScheduler(id, JobRunType.SCHEDULED)`.
2. **Job creation**: `runGroupWorkflowScheduler` (asset-group.service.ts:992-1065) loads workflow + group assets, requires tool installed (L1044-1048), then `createNewJob({ tool, assetIds, workflow, ..., jobRunType })` (L1053-1061).
3. **DB row**: `JobsRegistryService.createNewJob` (jobs-registry.service.ts:167-221) → `jobHistoryRepo.create({ workflow, jobRunType, jobHistoryName })` (L202-206, persisted on job_history.jobRunType — job-history.entity.ts:56) → inserts PENDING Job rows (L223+). `JobRunType.MANUAL='manual' | SCHEDULED='scheduled'` — enum.ts:180-183.
4. **Worker pickup — gRPC polling, NOT BullMQ**: Go worker runs a gocron poll every 1s — client.go:116-136 (`scheduler.Every(1).Second().Do(...)` → `processJob` under a MaxConcurrency semaphore) → `processJob` calls `client.JobsNext(ctx)` (job.go:18) → gRPC `JobsRegistryService.Next` (jobs_registry_grpc.pb.go:37,56) → controller `@GrpcMethod('JobsRegistryService','Next')` (jobs-registry.controller.ts:300-320) → `getNextJob` (jobs-registry.service.ts:416+): transaction-selects `WHERE jobs.status = PENDING` ordered `priority DESC, createdAt ASC` (L443-446). No BullMQ dependency in worker/go.mod (only `oasm-sdk-go v0.1.12` + `grpc-client/go`, worker/go.mod:13-14).
5. **Result back**: worker posts via gRPC `ResultSubdomains`/`ResultHttpProbe` etc. (controller.ts:354-383) or REST `POST /:workerId/result` (controller.ts:104-109) → `updateResult` / `updateResultByCategory` (jobs-registry.service.ts:613, 652): uploads JSON to S3 (`job-results` bucket, L617-622), then `jobResultQueue.add(BullMQName.JOB_RESULT, { workerId, jobId, resultRef, category }, { attempts: 3, backoff, removeOnComplete/Fail })` (L624-640, L664-680).
6. **Post-processing**: `JobResultProcessor` (job-result.processor.ts:24-27, concurrency 10) → `process` (L41): reads S3 file (L80-84), parses via builtInSteps parser or uses structured payload (L97-131), `dataAdapterService.syncData({ data, job })` (L134-138) → job `COMPLETED` (L140-144) → `getNextStepForJob` spawns next workflow step via `createNewJob` (L846-856) or `markWorkflowDone` (L150).

## 5. Every `assets-discovery-schedule` hit in repo

- core-api/src/common/enums/enum.ts:127 — enum value
- core-api/src/modules/targets/targets.module.ts:20 — registerQueue
- core-api/src/modules/targets/targets.service.ts:36 — @InjectQueue producer
- core-api/src/modules/jobs-registry/processors/scan-schedule.processor.ts:10 — consumer
- core-api/src/modules/targets/targets.service.spec.ts:83 — test mock `'BullQueue_assets-discovery-schedule'`
- .agents/research-reports/scheduling-bullmq-infrastructure-2026-08-09.md:10 — prior report (not code)

**Zero hits in worker/**. Go worker never touches BullMQ — jobs flow through DB rows + gRPC only.

## 6. BullMQ style + @nestjs/schedule usage

- v5 repeat style confirmed everywhere: `repeat.pattern` in add() options (targets.service.ts:619-621, asset-group.service.ts:533-535, 963-965), persist `job.repeatJobKey` (targets.service.ts:585,650; asset-group.service.ts:538,968), remove via `queue.removeJobScheduler(key)` (targets.service.ts:612; asset-group.service.ts:953,1078). No `repeatJobId`/`jobId` option used; no `upsertJobScheduler`.
- `ScheduleModule.forRoot()` in app.module.ts:29. Recurring internal tasks via @nestjs/schedule (all single-instance, Redis-lock guarded, **no `@SchedulerLock` anywhere** — grep = 0 hits):
  - statistic-cron.service.ts:30 `@Cron('0 0 * * *')` daily stats, wrapped in `redisLockService.withLock('cron:statistic-daily', 600_000)` (L32-33)
  - job-result-cleanup.service.ts:32 `@Cron('0 3 * * *')` S3 cleanup, withLock (L33-34)
  - system-configs.service.ts:122 `@Cron('0 3 * * *')` update check, 12h throttled (L124-126)
  - workers.service.ts:108 `@Interval(WORKER_TIMEOUT)` stale-worker cleanup
- Pattern: `@Cron` + `redisLockService.withLock` (Redis-based mutex, i.e. @SchedulerLock-equivalent but hand-rolled).

## Recommended pattern for per-integration recurring sync

1. **Queue**: new `INTEGRATION_SYNC_SCHEDULE = 'integration-sync-schedule'` in BullMQName (enum.ts:126-133) + `BullModule.registerQueue` in integrations.module.ts. Do NOT reuse `assets-discovery-schedule` (semantically per-target re-scan; one queue per schedule domain is the existing convention). Cloudflare connector already exists as abstract `syncAssets(config)` (connector.abstract.ts:88, factory dispatch at connector.factory.ts:26 `[IntegrationType.CLOUD_PROVIDER]: 'syncAssets'`) — cloudflare.schema.ts exists but `isAvailable: false`.
2. **Entity columns** (integration.entity.ts currently has none of these — no schedule/jobId/lastRun columns, only config jsonb at L48): add `syncSchedule varchar` (cron or `'disabled'`), `syncJobId varchar nullable` (repeatJobKey), optionally `lastRunAt timestamptz`. Mirror target.entity.ts:33,109-112 exactly, incl. the `IDX_..._scanSchedule_jobId` index pattern.
3. **Lifecycle** (copy the proven targets recipe verbatim):
   - Add/update: on integration create/update → if `syncJobId` set, `queue.removeJobScheduler(syncJobId)`; if schedule !== DISABLED, `queue.add(integrationId, { id: integrationId }, { repeat: { pattern: schedule } })`; persist `syncJobId = job.repeatJobKey` (targets.service.ts:606-628).
   - Disable/delete: remove scheduler + null the column (asset-group.service.ts:952-975 pattern; deleteTarget does NOT clean up — do it properly here).
   - Backfill: `onModuleInit` query `WHERE syncSchedule IS NOT NULL AND syncJobId IS NULL` (targets.service.ts:40-41,633-653).
   - Validate with the existing `IsCronSchedule` validator (cron-schedule.validator.ts:75) on the DTO — free reuse, already cron-parser-compatible.
4. **Consumer**: new `@Processor(BullMQName.INTEGRATION_SYNC_SCHEDULE)` WorkerHost in integrations module; `process(job)`: load integration → `runConnector(...)`/`syncAssets(config)` via connector.factory.ts:43. Copy the orphan guard from AssetGroupsScheduleConsumer (scan-schedule.processor.ts:39-50: on NotFoundException → `removeJobScheduler(job.repeatJobKey)`), and also call `syncData`/touch `lastRunAt` on success.
5. **Not needed**: BullMQ → worker handoff. The sync runs in core-api (like reScan/runGroupWorkflowScheduler do) — Go workers only execute scan jobs from DB rows via gRPC.

## Open Questions
- Where integration sync results should land: new table vs. reuse assets/jobs-registry `createNewJob` (which requires a `tool` — sync is not a tool). Asset-group path proves `createNewJob` works for non-user-initiated runs, but Cloudflare sync is a connector action, not a scan tool.
- Orphaned-target issue (§3) is a pre-existing bug worth fixing alongside (add `removeJobScheduler` + NotFoundException guard to AssetsDiscoveryScheduleConsumer).

## Sources (all T2 — codebase)
targets.service.ts, asset-group.service.ts, scan-schedule.processor.ts, job-result.processor.ts, jobs-registry.service.ts, jobs-registry.controller.ts, jobs-registry.module.ts, issue-creation.processor.ts, notifications.processor.ts / notifications.service.ts / notifications.module.ts, vulnerabilities.processor.ts / vulnerabilities.service.ts / vulnerabilities.module.ts, issues.service.ts / issues.module.ts, targets.module.ts / targets.dto.ts / targets.entity.ts, asset-group.module.ts, cron-schedule.validator.ts, enum.ts, app.module.ts, connector.abstract.ts / connector.factory.ts / cloudflare.schema.ts / integration.entity.ts, worker/internal/worker/client.go / job.go, worker/go.mod, grpc-client/go/jobs_registry/jobs_registry_grpc.pb.go, core-api/package.json.
