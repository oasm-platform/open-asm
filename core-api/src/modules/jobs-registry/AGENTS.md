# jobs-registry module

Scan jobs and workflow runs: creates `jobs` rows, lets workers claim them, ingests their results through a BullMQ queue, and drives the workflow DAG (`job_histories` = one run).

## Layout

- `jobs-registry.controller.ts`: HTTP under `jobs-registry` plus the gRPC `JobsRegistryService`. `mapJobToGrpcJob` builds the worker wire shape (connector image, manifest resource limits, decrypted config, `inputs`); `packStructFields` packs records into `google.protobuf.Struct`.
- `jobs-registry.service.ts`: `createNewJob`, the claim (`getNextJobs`), result enqueue, job/run listings and run detail, re-run, cancel, delete.
- `workflow-runner.service.ts`: the workflow engine (`startRun`, `retryRun`, `onJobTerminal`, `advanceRun`).
- `workflow-run-reconciler.service.ts`, `job-result-cleanup.service.ts`, `job-retention.service.ts`: crons.
- `processors/job-result.processor.ts`: `JobResultProcessor`. `processors/scan-schedule.processor.ts`: `AssetsDiscoveryScheduleConsumer`.
- `step-inputs.ts` (pure planner: which jobs a step creates), `step-scope.loader.ts` (`StepScopeLoader`, loads the scope rows; `URL_INPUTS_PER_HOST = 50`), `connector-inputs.ts` (connector `inputs` map, repository clone URL + credentials).
- `entities/`: `Job`, `JobHistory`, `JobErrorLog`. `dto/`: request/response DTOs.

## Public surface

| Route (`jobs-registry/...`) | Permission |
|---|---|
| `GET /`, `GET timeline`, `GET histories`, `GET histories/:id`, `GET histories/:id/workflow` | `job.read` |
| `POST :id/re-run`, `POST histories/:id/re-run` (new run via `retryRun`) | `job.write` |
| `POST :id/cancel`, `POST histories/:id/cancel` | `job.write`; `@PublishEvent(job.cancelled)` |
| `DELETE :id` | `job.delete` |
| `GET :workerId/next`, `POST :workerId/result[/subdomains\|http-probe\|ports\|vulnerabilities\|screenshot\|url-discovery]` | `@Public()` + `@WorkerTokenAuth()` (`worker-token` header) |

- gRPC `JobsRegistryService` (`src/proto/jobs_registry.proto`): `Next`, `NextBatch`, `Result` (deprecated), `ResultSubdomains`, `ResultHttpProbe`, `ResultPorts`, `ResultVulnerabilities`, `ResultScreenshot`, `ResultUrlDiscovery`. All use `GrpcWorkerTokenGuard`.
- Exports `JobsRegistryService` and `WorkflowRunnerService`. The module is `@Global()`.
- Queues: registers and consumes `BullMQName.JOB_RESULT` (concurrency 10; enqueued with 3 attempts, exponential backoff, removed on complete/fail). Consumes `ASSETS_DISCOVERY_SCHEDULE`, which `targets` registers and fills; it calls `AssetsService.reScan` with `JobRunType.SCHEDULED`.
- In-process events (EventEmitter2): `EventTriggerType.WORKFLOW_START` (from `startRun`, and from `createNewJob` when it creates its own history), `WORKFLOW_END` (after the commit that completes a run). Listeners: `statistic.service.ts`, `projects/project-run-events.listener.ts`, `assets/url-discovery.service.ts`.
- Redis: `jobs:<jobId>` is published when `job.isPublishEvent` (no subscriber in core-api). Cancels and "jobs available" hints go through `WorkerStreamRegistry` (workers module).
- Crons (each behind a Redis `@Lock`): reconcile stalled runs `*/2 * * * *`; delete `job-results` bucket files older than 30 days `0 3 * * *`; prune terminal jobs older than `JOB_RETENTION_DAYS` (180) in batches of 10,000 `30 3 * * *`.

## Data model

- `jobs` (`Job`): FKs to asset, tool, jobHistory and assetService all `CASCADE`; `configProfile` is `SET NULL`. `workerId` is a plain column with **no FK** to `workers`. `command` is set only for built-in tools; connector jobs carry `inputs` (jsonb) and `config` (jsonb) instead. Indexes include `IDX_jobs_dispatch` (its `priority DESC, createdAt ASC` direction exists only in the migration) and `IDX_jobs_workerId_status`.
- `job_histories` (`JobHistory`) is a run. `steps` (jsonb) is the engine's source of truth; `scope` stores the `targetIds`/`assetIds` captured at start. Provenance columns (`projectId`, `projectWorkflowId`, `triggerId`, `causedByRunId`, `chainDepth`) are `SET NULL`. Deleting a workflow cascades to its runs. On run delete, `ports`, `httpResponses` and `discoveredUrls` cascade but `vulnerabilities` are `SET NULL`. `pendingJobsCount` is deprecated.
- A run's status is not stored. It is derived from its jobs (`JOB_HISTORY_STATUS_SQL`, used in SELECT and HAVING).
- `JobErrorLog` rows cascade with their job. `handleJobError` skips a log whose message equals the previous one.

## Invariants

- **Tenant scoping.** Jobs have no `workspaceId`. Scope is `asset → target.workspaceId`. Runs are checked with `workflow.workspace` OR the jobs' targets (`loadJobHistoryInWorkspace`, `cancelJobHistory`), because runs without a workflow exist (custom-template runs).
- **`jobs.config` holds decrypted secrets.** `createNewJob` stores the output of `ToolConfigProfilesService.resolveConfigForJob`. `getManyJobs` masks it with `maskJobConfig`. Any new read path must mask it too.
- **Only `IN_PROGRESS` moves to a terminal state.** `JobResultProcessor` and `handleJobError` use conditional updates (`status = IN_PROGRESS`), so a cancel or re-run that happens during processing wins. `findJobForUpdate` matches `workerId + jobId + IN_PROGRESS`. A result that no longer matches is discarded and its staged file is deleted.
- **Results are staged.** The payload is uploaded to storage bucket `job-results`. The BullMQ job carries only `resultRef` (`bucket/file`). A category mismatch throws `UnrecoverableError`. Built-in results go through `builtInTools[].parser`. Empty output, and the benign outcomes in `BENIGN_BUILT_IN_OUTCOMES`, complete the job with no data.
- **Claim** (`getNextJobs`): one transaction, at most `MAX_JOB_CLAIM_SIZE` (100), ordered by priority then oldest. BUILT_IN workers claim built-in tool names, plus connector slugs only when `runMode === 'node'`. Non-cloud workers claim only from their own workspace. A worker with `internalNetworkId` claims only targets on that network. PROVIDER workers claim only their own `tool.id`. The worker row is query-cached for `WORKER_CLAIM_CACHE_MS` (5 s).
- **Custom templates.** `createNewJob` strips `customTemplateIds`/`customTemplates` from inline config, so only the explicit `customTemplateIds` argument can set them. At claim time `attachCustomTemplates` replaces them with presigned URLs (TTL 3600 s) and fails the job if a template is gone.
- **Repository credentials** (GIT_ORG targets) are decrypted at dispatch in `resolveConnectorInputs` and never persisted.
- **Engine** (`WorkflowRunnerService.advance`): runs under a `for_no_key_update` lock on the run row. `FOR UPDATE` would deadlock against the FK `KEY SHARE` taken by the job inserts. `isCompleted` is a hard stop, and `cancelJobHistory` sets it. Every step reuses the run's stored `scope`. A missing tool fails the step. A step with no inputs is skipped (`no-inputs`). When the workspace has `isAssetsDiscovery` off, SUBDOMAINS steps are dropped (`assets-discovery-off`). `onJobTerminal` never throws. Events are emitted only after commit.
- A connector job whose config fails to resolve is persisted as FAILED with **no asset** (`persistFailedConfigJob`) and the error is rethrown.

## Coupling

- Imports `ConnectorsModule`, `IntegrationsModule` and `WorkspacesModule`, and registers the `ToolConfigProfile` repository. `ToolsService`, `ToolConfigProfilesService`, `WorkerStreamRegistry`, storage, data-adapter, vulnerability lifecycle and `AssetsService` come from `@Global()` modules.
- **Import cycle** tools.service → workers.service → jobs-registry.service → tools.service. `JobsRegistryService` injects `ToolsService` with `@Optional() @Inject(forwardRef(...))`, and `WorkersService` injects `JobsRegistryService` with `forwardRef`. Keep the module order in `combine.module.ts`.
- Other code writes `jobs` directly. `WorkersService` uses `jobsRegistryService.repo` and raw SQL in `resetStuckAndFailedJobs`. `ToolSyncService.dedupeExistingTools` rewrites `toolId`. `ToolConfigProfilesService.remove` reads `jobs`. `AssetsModule` registers the `Job` repository.
- `startRun` callers: `workflows/trigger-workflow.service.ts`, `projects/project-workflows.service.ts`, `assets/url-discovery.service.ts`, `vulnerabilities.service.ts`. `createNewJob` callers: `templates.service.ts`, `vulnerabilities.service.ts`. Agents call `getManyJobs`.

## Gotchas

- `getNextJobs` comments mention `SKIP LOCKED`, but the query only does `setLock('pessimistic_write')` (plain `FOR UPDATE OF jobs`). Concurrent claims block each other instead of skipping rows.
- Claim and result RPCs/routes trust the `workerId` in the request or path. The guards only check that the token is valid.
- Asset-less FAILED jobs never match `getManyJobs` (`target.workspaceId` filter) or `verifyJobBelongsToWorkspace` (inner joins). They cannot be re-run, cancelled or deleted one by one, and `resetStuckAndFailedJobs` skips them (`assetId IS NOT NULL`).
- Retention keeps `job_histories`. A run whose jobs were all pruned drops out of `GET histories`, which inner-joins `jobs`.
- `Tool.name` is the connector slug. The gRPC `tool` field must be the slug, because the worker derives container names from it.
- Worker severity arrives as the proto enum name. `normalizeSeverity` lowercases it and falls back to `info`.

## Testing

Specs are colocated: service, controller, `workflow-runner`, `workflow-run-reconciler`, `job-result-cleanup`, `processors/*`, `step-inputs`, `step-scope.loader`, `connector-inputs`, `dto/jobs-registry.dto.spec.ts`, plus `jobs-registry.audit-wiring.spec.ts`, which checks which handlers publish `job.cancelled`.
