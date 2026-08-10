# Research Report: BullMQ Scheduling & Background Job Infrastructure (Open-ASM)

## Meta
- **Date**: 2026-08-09
- **Depth**: Full source read of every queue registration, both schedule processors, both scheduler-producing services, job-result flow end-to-end (incl. Go worker + SDK gRPC client), entity columns, migrations, installed versions.
- **Original question**: Document existing scheduling + background job infrastructure to support a per-integration "periodic Cloudflare asset sync" schedule (user picks cron when creating the integration).
- **Sources**: 20+ files read in-repo (all T2), plus Go module cache for `oasm-sdk-go@v0.1.12-0.20260716105723-303db93cfaf0` (T2, external dep). No external web sources needed — the question is fully answerable from the codebase.

## Executive Summary
Open-ASM has **two identical, battle-tested recurring-schedule patterns** built on BullMQ v5 repeat jobs: per-target re-scan (`assets-discovery-schedule`) and per-asset-group-workflow runs (`asset-groups-workflow-schedule`). Both follow the same recipe: `queue.add(<entityId-as-job-name>, {id}, {repeat:{pattern}})` → persist `job.repeatJobKey` on the entity row (`jobId` column) → delete/update calls `queue.removeJobScheduler(key)` → a `WorkerHost` processor in the @Global `JobsRegistryModule` consumes ticks and delegates to a service. Queued work never goes directly to Go workers via BullMQ — BullMQ jobs become **DB rows** (`jobs` + `job_histories`), and Go workers **pull** PENDING rows over gRPC (`JobsRegistryService.Next`), then push results back over gRPC into the `job-result` BullMQ queue for async post-processing. `ASSETS_DISCOVERY_SCHEDULE` is **active, not dead** (producer: `TargetsService`; consumer: `AssetsDiscoveryScheduleConsumer`), though its downstream `target.domain.re-scan` event currently has **zero listeners**. Installed versions: `bullmq@5.81.2` (declared `^5.65.1`), `@nestjs/bullmq@^11.0.4`; the codebase uses BullMQ v5 API style throughout (`repeat.pattern`, `repeatJobKey`, `removeJobScheduler`), but **never passes `jobId` inside `repeat`** — dedup relies on the job *name* being the entity id.

---

## 1. BullMQ setup: queues, registrations, producers, consumers

**Root connection** — `core-api/src/app.module.ts:44-51`:
```ts
BullModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    connection: { url: config.get('REDIS_URL') },
  }),
  inject: [ConfigService],
}),
```
`ScheduleModule.forRoot()` (@nestjs/schedule) is registered at `app.module.ts:29` but is only used for fixed `@Cron` utilities (see §4.3), not for user-driven scheduling.

**Complete queue table** (all registrations are `BullModule.registerQueue` in @Global modules):

| Queue (BullMQName, enum.ts:126-133) | Registered in | Producer (InjectQueue) | Consumer (Processor) | Status |
|---|---|---|---|---|
| `assets-discovery-schedule` | targets.module.ts:18-20 | TargetsService — targets.service.ts:36-37 | `AssetsDiscoveryScheduleConsumer` — scan-schedule.processor.ts:10-20 | **Active** |
| `asset-groups-workflow-schedule` | asset-group.module.ts:19-21 | AssetGroupService — asset-group.service.ts:47-48 | `AssetGroupsScheduleConsumer` — scan-schedule.processor.ts:22-54 | **Active** |
| `job-result` | jobs-registry.module.ts:33-35 | JobsRegistryService — jobs-registry.service.ts:100 (updateResult/updateResultByCategory L624, L664) | `JobResultProcessor` (concurrency 10) — job-result.processor.ts:24-27 | **Active** |
| `notification` | notifications.module.ts:18-20 | NotificationsService — notifications.service.ts:19 | `NotificationsProcessor` — notifications.processor.ts:32 | **Active** |
| `vulnerability-analysis` | vulnerabilities.module.ts:20-24 | VulnerabilitiesService — vulnerabilities.service.ts:45 | `VulnerabilityAnalysisProcessor` — vulnerability-analysis.processor.ts:18 | **Active** (removeOnComplete/Fail: true default) |
| `issue-creation` | issues.module.ts:18+ (defaultJobOptions removeOnComplete age:5) | IssuesService — issues.service.ts:45 | `IssueCreationProcessor` exists (issue-creation.processor.ts:17) but **commented out** of providers — jobs-registry.module.ts:36-38, 47 | **Produced, not consumed** |

**Both schedule consumers live in one file** — `core-api/src/modules/jobs-registry/processors/scan-schedule.processor.ts` (FULL, 55 lines):
```ts
1:  import { BullMQName, JobRunType } from '@/common/enums/enum';
...
10: @Processor(BullMQName.ASSETS_DISCOVERY_SCHEDULE)
11: export class AssetsDiscoveryScheduleConsumer extends WorkerHost {
12:   constructor(private assetService: AssetsService) { super(); }
16:   async process(job: Job<Target>): Promise<void> {
17:     const targetId = job.data.id;
18:     await this.assetService.reScan(targetId);
19:   }
20: }
21:
22: @Processor(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
23: export class AssetGroupsScheduleConsumer extends WorkerHost {
24:   private readonly logger = new Logger(AssetGroupsScheduleConsumer.name);
25:   constructor(private assetGroupService: AssetGroupService) { super(); }
28:   async process(job: Job<AssetGroupWorkflow>): Promise<void> {
29:     const assetGroupWorkflowId = job.data.id;
30:     try {
31:       await this.assetGroupService.runGroupWorkflowScheduler(
32:         assetGroupWorkflowId,
33:         JobRunType.SCHEDULED,
34:       );
35:     } catch (error) {
36:       // The job is orphaned: its asset group/workflow was removed from the
37:       // DB without cleaning up the BullMQ schedule. Drop the job instead of
38:       // letting it fail on every repeat.
39:       if (error instanceof NotFoundException) {
40:         this.logger.warn(
41:           `Asset group workflow "${assetGroupWorkflowId}" no longer exists, removing scheduled job`,
42:         );
43:         if (job.repeatJobKey) {
44:           await this.assetGroupService.removeGroupWorkflowScheduler(
45:             job.repeatJobKey,
46:           );
47:         } else {
48:           await job.remove();
49:         }
50:         return;
51:       }
52:       throw error;
53:     }
54:   }
55: }
```
Both are registered as providers in the @Global `JobsRegistryModule` — jobs-registry.module.ts:41-48:
```ts
providers: [
  JobsRegistryService,
  AssetsDiscoveryScheduleConsumer,
  AssetGroupsScheduleConsumer,
  JobResultProcessor,
  JobResultCleanupService,
  // IssueCreationProcessor,
],
```
Module is `@Global()` (jobs-registry.module.ts:21), same as TargetsModule (:13) and AssetGroupModule (:16), so the queues are effectively app-wide singletons.

**Producer of `assets-discovery-schedule`** — `TargetsService.updateTargetScanScheduleJob`, targets.service.ts:606-628 (see §3 for full quote). Triggered from `updateTarget` (L579-587) and `handleUpdateScanSchedule` (L633-653, run at `onModuleInit`, L40-42).

---

## 2. Recurring jobs pattern (asset-group workflow scheduler)

All scheduler logic is in `core-api/src/modules/asset-group/asset-group.service.ts`; queue injected at L47-48:
```ts
@InjectQueue(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
private scanScheduleQueue: Queue<AssetGroupWorkflow>,
```

**Add (create)** — `addManyWorkflows`, L523-552 (verbatim):
```ts
const assetGroupWorkflowId = randomUUID();
// 'disabled' is not a valid BullMQ repeat pattern (cron-parser would
// reject it), so only register a scheduler for real schedules.
let jobId: string | null = null;
if (schedule !== 'disabled') {
  const job = await this.scanScheduleQueue.add(
    assetGroupWorkflowId,
    { id: assetGroupWorkflowId } as AssetGroupWorkflow,
    {
      repeat: {
        pattern: schedule,
      },
    },
  );
  jobId = job.repeatJobKey ?? null;
}

const record = this.assetGroupWorkflowRepo.create({
  id: assetGroupWorkflowId,
  assetGroup: { id: groupId },
  workflow: { id: workflowId },
  schedule,
  jobId,
});
```
**Key points**: job *name* = entity UUID; **no `jobId` in repeat opts**; the **`repeatJobKey` is stored on the row** in the `jobId` column (`asset-groups-workflows.entity.ts:40-45`: `schedule` varchar default `'disabled'` — documented as "any 5-field cron expression… 'disabled' is the only disable value" — plus `jobId` varchar nullable).

**Remove (delete / unlink)** — `delete`, L765-773; `removeManyWorkflows`, L681-686; `rollbackCreatedGroup`, L396-401 — identical shape:
```ts
// Cancel the BullMQ repeat schedulers so no new runs are queued
// for the group's workflows while the group is being deleted.
const groupWorkflows = assetGroup.assetGroupWorkflows ?? [];
await Promise.all(
  groupWorkflows
    .map((agw) => agw.jobId)
    .filter((jobId): jobId is string => Boolean(jobId))
    .map((jobId) => this.scanScheduleQueue.removeJobScheduler(jobId)),
);
```
(DB FK cascades then remove join rows/workflows — comment L775-777.)

**Update (schedule change)** — `updateAssetGroupWorkflow`, L949-976 (verbatim core):
```ts
if (updateData.schedule !== undefined) {
  assetGroupWorkspace.schedule = updateData.schedule;

  if (assetGroupWorkspace.jobId) {
    await this.scanScheduleQueue.removeJobScheduler(
      assetGroupWorkspace.jobId,
    );
  }

  if (updateData.schedule !== 'disabled') {
    const newJob = await this.scanScheduleQueue.add(
      assetGroupWorkspace.id,
      { id: assetGroupWorkspace.id } as AssetGroupWorkflow,
      {
        repeat: {
          pattern: assetGroupWorkspace.schedule,
        },
      },
    );
    if (newJob.repeatJobKey) {
      assetGroupWorkspace.jobId = newJob.repeatJobKey;
    }
  } else {
    // The old scheduler was removed above; drop the stale jobId so
    // it no longer references a removed repeat job.
    assetGroupWorkspace.jobId = null;
  }
}
```

**Manual run trigger** — `runGroupWorkflowScheduler(assetGroupWorkflowId, jobRunType)`, L992-1065. Loads agw + workflow + workspace + assets, validates ≥1 asset and an installed tool, then:
```ts
await this.jobRegistryService.createNewJob({
  tool,
  assetIds: assets.map((a) => a.id),
  workflow: workflow,
  priority: tool.priority,
  workspaceId: workflow.workspace.id,
  jobName: assetGroupName,
  jobRunType,
});
```
`JobRunType` (`enum.ts:180-183`) = `MANUAL | SCHEDULED`; the value lands on the `job_histories` row (jobs-registry.service.ts:202-206).

**Orphan cleanup helper** — `removeGroupWorkflowScheduler(repeatJobKey)`, L1072-1079: `if (!repeatJobKey) return; await this.scanScheduleQueue.removeJobScheduler(repeatJobKey);` — called by the consumer (§1) when the agw no longer exists.

**Create-time rules**: `create` (L305-381) rejects `schedule` without `toolIds` (L331-339), defaults to `CronSchedule.EVERY_3_DAYS` (L363), and rolls back schedulers on failure (L367-374 → rollbackCreatedGroup).

---

## 3. Target re-scan scheduling (`targets.scanSchedule`) end-to-end

**Columns** — `core-api/src/modules/targets/entities/target.entity.ts:101-112`:
```ts
@Column({ type: 'varchar', default: CronSchedule.DISABLED, nullable: true })
scanSchedule: CronSchedule;

@Column({ nullable: true })
jobId: string;
```
Index `IDX_targets_scanSchedule_jobId` on `['scanSchedule', 'jobId']` (L33; migration 1780236911541-CreateIndexes.ts:43; recreated as varchar in 1784014752144-ConvertEnumColumnsToString.ts:164). `CronSchedule` enum at enum.ts:80-92 (`DISABLED='disabled'`, `DAILY='0 0 * * *'`, `EVERY_3_DAYS='0 0 */3 * *'`, `WEEKLY='0 0 * * 0'`, `BI_WEEKLY='0 0 */14 * *'`, `MONTHLY='0 0 1 * *'`).

**Producer** — `updateTargetScanScheduleJob`, targets.service.ts:606-628 (verbatim):
```ts
private async updateTargetScanScheduleJob(
  target: Target,
  scanSchedule: CronSchedule,
): Promise<Job<Target> | null> {
  // Remove any existing jobs for this target
  if (target.jobId) {
    await this.scanScheduleQueue.removeJobScheduler(target.jobId);
  }
  if (scanSchedule !== CronSchedule.DISABLED) {
    const job = await this.scanScheduleQueue.add(
      target.id, // Job name is the target ID
      { id: target.id } as Target,
      {
        repeat: {
          pattern: scanSchedule,
        },
      },
    );

    return job;
  }
  return null;
}
```
Queue injected at targets.service.ts:36-37: `@InjectQueue(BullMQName.ASSETS_DISCOVERY_SCHEDULE) private scanScheduleQueue: Queue<Target>`.

**Callers**:
- `updateTarget` L571-596: `dto.scanSchedule !== undefined` → `updateTargetScanScheduleJob` → `jobId = job.repeatJobKey` → `repo.update(id, { ...dto, jobId })` (L590-593). So **the repeatJobKey is persisted on the target row** exactly like §2.
- `handleUpdateScanSchedule` L633-653 (boot-time **self-healing**; invoked from `onModuleInit` L40-42): selects `scanSchedule IS NOT NULL AND jobId IS NULL` targets and re-registers them, storing `job.repeatJobKey` (L649-651). Note the stale doc comment L599-604 claims "scheduled to run every day at 00:00" — no such @Cron exists today; it only runs once at startup.

**Consumer** — `AssetsDiscoveryScheduleConsumer` (§1) → `AssetsService.reScan(targetId)`, assets.service.ts:411-449:
```ts
public async reScan(targetId: string): Promise<DefaultMessageResponseDto> {
  const asset = await this.assetRepo.findOne({ where: { target: { id: targetId }, isPrimary: true } });
  if (!asset) { throw new NotFoundException('Asset not found'); }
  const target = await this.targetRepo.findOne({ where: { id: targetId } });
  const workspaceId = await this.workspaceService.getWorkspaceIdByTargetId(targetId);
  ...
  const reScanCount = target.reScanCount + 1;
  await this.targetRepo.update(targetId, { reScanCount, lastDiscoveredAt: new Date() });
  this.eventEmitter.emit('target.domain.re-scan', target);
  return { message: 'Scan started' };
}
```
**Gap**: `target.domain.re-scan` has **zero listeners** in core-api (only the emit site + spec assert it; the only `@OnEvent` handlers in the repo are statistic.service.ts:1446/1471 for WORKFLOW_START/END). The scheduled tick currently only bumps `reScanCount`/`lastDiscoveredAt` and emits into the void. Manual trigger: `POST targets/:id/re-scan` → `reScan` (targets.controller.ts:185-188).

**Delete gap**: `deleteTarget` (targets.service.ts:542-561) deletes the row **without** `removeJobScheduler` — the repeat scheduler is orphaned (BullMQ keeps ticking a job whose target is gone; unlike the asset-group consumer, `AssetsDiscoveryScheduleConsumer` has no NotFound guard). `reScan` would then throw NotFoundException on the first tick.

---

## 4. Job execution flow: queued job → Go worker → result → job_history

**One complete cycle** (BullMQ is only the *scheduler*; execution is DB-row + gRPC pull):

1. **Schedule tick** → processor (e.g. `AssetGroupsScheduleConsumer`) → `runGroupWorkflowScheduler` → **`createNewJob`** (jobs-registry.service.ts:167-311):
   - Step 1 (L196-221): create `job_histories` row with `jobRunType` + `jobHistoryName`; emit `WORKFLOW_START`.
   - Step 2-4 (L223-308): expand tools→assets (HTTP_PROBE/SCREENSHOT → asset services; PORTS_SCANNER clears assetIds; SUBDOMAINS filters `isPrimary`), insert **`jobs` rows** with `status: PENDING`, priority, bound `command` (via `bindingCommand` of the built-in tool's command template).
2. **Worker pull** — Go worker loop `worker/internal/worker/job.go:17-18`:
   ```go
   job, err := client.JobsNext(ctx)
   ```
   SDK `oasm-sdk-go@v0.1.12-0.20260716105723-303db93cfaf0/oasm/job_registry_next.go` → gRPC `JobsRegistryService.Next` on `localhost:16276` (SDK client.go:61, default `grpcHost: "localhost:16276"`).
   Core side: `jobs-registry.controller.ts:300-320` — `@UseGuards(GrpcWorkerTokenGuard) @GrpcMethod('JobsRegistryService', 'Next')` → `jobsRegistryService.getNextJob(worker.id)`.
   **`getNextJob`** (jobs-registry.service.ts:416-532): worker lookup (30s cache, L420-427) → transaction → SELECT PENDING job filtered by worker's type/scope/workspace/tool/internalNetwork (L438-472) → `setLock('pessimistic_write', ...)` + `limit(1)` (L489-492) → `update(Job, job.id, { workerId, status: IN_PROGRESS, pickJobAt: new Date() })` (L505-509) → returns `{id, category, command, asset}`.
3. **Execution** — worker runs `cmd /C` / `sh -c` on the command string (job.go:140-149) or the `screenshot` branch (job.go:75-138), then `submitCategoryResult` (job.go:194-214) routes by category to `JobsSubdomainsResult` / `JobsHttpProbeResult` / `JobsPortsResult` / `JobsVulnerabilitiesResult` / `JobsScreenshotResult` (unknown → deprecated `JobsResult`).
4. **Result ingest** — gRPC handlers `@GrpcMethod('JobsRegistryService', 'ResultSubdomains' | 'ResultHttpProbe' | 'ResultPorts' | 'ResultVulnerabilities' | 'ResultScreenshot')` (controller L353-489) → `updateResultByCategory` (jobs-registry.service.ts:652-684):
   ```ts
   const { path: resultRef } = await this.storageService.uploadFile(
     fileName, Buffer.from(JSON.stringify(dto)), 'job-results');
   const bullJob = await this.jobResultQueue.add(
     BullMQName.JOB_RESULT,
     { workerId, jobId: dto.jobId, resultRef, category },
     { attempts: 3, backoff: { type: 'exponential', delay: 1000 },
       removeOnComplete: true, removeOnFail: true },
   );
   ```
   (Deprecated generic twin: `updateResult` L613-643; REST endpoints `/:workerId/result*` controller L104-179.)
5. **Async result processing** — `JobResultProcessor` (`@Processor(JOB_RESULT, { concurrency: 10 })`, job-result.processor.ts:24-194): `findJobForUpdate` (must be IN_PROGRESS + workerId match, L916-936) → read result JSON from storage → `rawResult.error` short-circuits (L87-89) → built-in tools parse `raw` via `builtInStep.parser` (L97-118), external tools take `payload` (L119-131) → `dataAdapterService.syncData` if `job.isSaveData` (L133-138) → job `COMPLETED` + `completedAt` (L140-144) → `getNextStepForJob` spawns next workflow step or `markWorkflowDone` (L146-151) → optional `redis.publish('jobs:'+id)` (L153-158) → delete result file; final-failure path → `handleJobError` (FAILED + retryCount + deduped error log, L686-707, called L174).
6. **history rows**: `job_histories` created at step 1 with `jobRunType` (MANUAL/SCHEDULED); `markWorkflowDone` flips `isCompleted` and emits WORKFLOW_END (L868-908).

**Existing @Cron utilities** (not user-facing): statistic-cron.service.ts:30 `@Cron('0 0 * * *')`, job-result-cleanup.service.ts:32 `@Cron('0 3 * * *')`, system-configs.service.ts:122 `@Cron('0 3 * * *')`, workers.service.ts:108 `@Interval(WORKER_TIMEOUT)`.

---

## 5. Is `assets-discovery-schedule` dead? — NO, it is active

- **Producer exists**: `TargetsService` — `@InjectQueue(BullMQName.ASSETS_DISCOVERY_SCHEDULE)` targets.service.ts:36-37; adds repeat jobs in `updateTargetScanScheduleJob` (L614-623), called from `updateTarget` (L579) and boot-time `handleUpdateScanSchedule` (L645). Nothing else adds to this queue.
- **Consumer exists**: `AssetsDiscoveryScheduleConsumer` (scan-schedule.processor.ts:10-20), registered as a provider in the @Global JobsRegistryModule (jobs-registry.module.ts:43) and the queue itself registered in the @Global TargetsModule (targets.module.ts:18-20).
- It is a **per-target re-scan scheduler, not a generic fetch/sync cron** — and its downstream effect is currently a no-op (reScan's `target.domain.re-scan` event has no listeners, §3). So as a *pattern* it is the best template; as a *sync runner* it does not exist anywhere yet. The closest thing to a "recurring fetch that produces real work" is `asset-groups-workflow-schedule`, whose consumer calls `createNewJob` (real `jobs` rows) with `JobRunType.SCHEDULED`.

---

## 6. Versions and BullMQ v5 API usage

- `core-api/package.json:37` — `"@nestjs/bullmq": "^11.0.4"`; `:58` — `"bullmq": "^5.65.1"`. **Installed**: `bullmq@5.81.2` (core-api/node_modules/bullmq/package.json).
- BullMQ **v5 repeat style is used throughout**: `repeat: { pattern }` (asset-group.service.ts:533-535, 963-965; targets.service.ts:618-621), `job.repeatJobKey` persisted to DB (asset-group.service.ts:538, 968-969; targets.service.ts:585, 650), removal via `queue.removeJobScheduler(key)` (asset-group.service.ts:400, 685, 772, 953, 1078; targets.service.ts:612).
- **Detail**: neither producer passes `jobId` inside `repeat` — dedup/identity relies on the job **name** being the entity id (`queue.add(target.id, ...)` targets.service.ts:616; `queue.add(assetGroupWorkflowId, ...)` asset-group.service.ts:530, 960). BullMQ v5 derives `repeatJobKey = repeat:{name|jobId}:{pattern|every}`, so name-as-id + pattern gives one stable scheduler per entity; `removeJobScheduler(repeatJobKey)` removes it. This is the exact pattern to copy.

---

## Recommended pattern for per-integration recurring Cloudflare asset sync

**Queue**: add `CLOUDFLARE_ASSET_SYNC_SCHEDULE = 'cloudflare-asset-sync-schedule'` to `BullMQName` (enum.ts:126-133). Register `BullModule.registerQueue({ name: BullMQName.CLOUDFLARE_ASSET_SYNC_SCHEDULE })` in the integrations module (Global, mirroring targets.module.ts:18-20). **Do not reuse `assets-discovery-schedule`** — it is semantically per-target re-scan and shared with targets; a separate queue keeps consumer isolation (same reason the repo has one queue per schedule domain).

**Consumer**: new `WorkerHost` class `@Processor(BullMQName.CLOUDFLARE_ASSET_SYNC_SCHEDULE)` in `jobs-registry/processors/` (or integrations module), registered as provider — mirror scan-schedule.processor.ts:10-20 **plus** the orphan guard from AssetGroupsScheduleConsumer (L35-51): `NotFoundException → removeJobScheduler(job.repeatJobKey)` (target deleted while scheduler lived), and delegate to an `IntegrationsService.syncCloudflareAssets(integrationId, JobRunType.SCHEDULED)`.

**Entity columns** (integrations table):
- `syncSchedule` varchar NOT NULL DEFAULT 'disabled' — plain varchar, NOT the CronSchedule enum, mirroring asset-groups-workflows.entity.ts:32-41 (comment: "BullMQ accepts any 5-field cron expression… 'disabled' is the only disable value"). This gives the user free-form cron while keeping one disable sentinel.
- `syncJobId` varchar nullable — the BullMQ `repeatJobKey` (mirror asset-groups-workflows.entity.ts:43-45 / target.entity.ts:111-112).
- Composite index `(syncSchedule, syncJobId)` (mirror target.entity.ts:33, used by the boot self-heal query).

**Lifecycle** (mirror asset-group.service.ts exactly):
- **Create** (with schedule ≠ 'disabled'): `queue.add(integrationId, { id: integrationId }, { repeat: { pattern: schedule } })` → persist `job.repeatJobKey` in `syncJobId`. Transactional rollback must `removeJobScheduler` (mirror `rollbackCreatedGroup` L389-422).
- **Update schedule**: `removeJobScheduler(old syncJobId)` → re-add with new pattern → store new repeatJobKey; `'disabled'` → remove + set `syncJobId = null` (mirror `updateAssetGroupWorkflow` L949-976).
- **Delete**: `removeJobScheduler(syncJobId)` **before** the row delete (mirror `delete` L765-773; do NOT copy targets.deleteTarget which skips this and orphans the scheduler).
- **Boot self-heal**: `onModuleInit` → re-register rows where `syncSchedule IS NOT NULL AND syncJobId IS NULL` (mirror `handleUpdateScanSchedule` L633-653) — covers crash-between-add-and-persist and pre-existing orphans.

**Manual run**: controller endpoint → `IntegrationsService.syncCloudflareAssets(integrationId, JobRunType.MANUAL)` sharing the same service method the consumer calls with `JobRunType.SCHEDULED` (mirror `runGroupWorkflowScheduler` L992-1065 + controller reuse).

**Execution shape**: if the sync must produce scanner work, end with `jobsRegistryService.createNewJob(...)` (creates job_histories + PENDING jobs → workers pull via gRPC, §4). If it is a pure Cloudflare-fetch-and-persist, do it synchronously in the processor and/or via `DataAdapterService.syncData` (job-result.processor.ts:133-138 pattern) — no worker involvement needed.

## Open Questions
1. Does the integration entity exist yet and where (module path, columns)? Not located in this pass (notifications module imports `IntegrationsModule`, notifications.module.ts:21 — the integrations module exists; its entity/schema was outside the research scope).
2. Should the sync produce scan `jobs` (worker-executed) or be API-only? Decides whether `createNewJob` is part of the consumer path.
3. `target.domain.re-scan` has no listener — if the new sync replaces target re-scan semantics, note that today a scheduled tick does not actually re-run asset discovery.

## Sources
- T2 (in-repo): app.module.ts, enum.ts, targets.module.ts / targets.service.ts / targets.controller.ts / target.entity.ts, asset-group.module.ts / asset-group.service.ts / asset-groups-workflows.entity.ts, jobs-registry.module.ts / jobs-registry.service.ts / jobs-registry.controller.ts / processors/scan-schedule.processor.ts / processors/job-result.processor.ts / processors/issue-creation.processor.ts, issues.module.ts, vulnerabilities.module.ts / vulnerabilities.service.ts, notifications.module.ts, assets.service.ts, statistic-cron.service.ts, migrations (1773452480784-Initialization.ts:44,68; 1780236911541-CreateIndexes.ts:43; 1784014752144-ConvertEnumColumnsToString.ts:164), package.json.
- T2 (external dep): oasm-sdk-go@v0.1.12-0.20260716105723-303db93cfaf0 (client.go, job_registry_next.go) in Go module cache; worker/internal/worker/job.go.
