# workers module

Scan worker nodes: join/identity, liveness, listing, the gRPC channels a worker uses (alive, telemetry, tool archives, remote execute, bidirectional `Connect`), and the selection of workers for AI agent commands.

## Layout

- `workers.controller.ts`: HTTP under `workers` plus most gRPC `WorkersService` methods.
- `worker-stream.controller.ts`: gRPC bidi `Connect` (`WorkerStreamController`).
- `workers.service.ts`: join/rejoin, alive, list/detail, the stale-worker sweep, job release, internal-network link, and remote-execute result → Redis.
- `remote-execute-subscribe.service.ts`: in-memory registry of `RemoteExecuteSubscribe` streams, pushes for agent commands and tool runs, and conversation → worker pinning.
- `worker-stream-registry.service.ts`: `Connect` streams of this instance and the Redis fan-out for cancels and job hints.
- `alive-stream-manager.service.ts`: in-memory `Alive` streams. Backs `isOnline`.
- `worker-join-key.service.ts`: one-time join keys, stored only in Redis.
- `worker-telemetry.service.ts`, `worker-telemetry.store.ts` (abstract), `redis-worker-telemetry.store.ts`, `worker-telemetry.types.ts` (normalizer and limits).
- `entities/worker.entity.ts`: `WorkerInstance`.

## Public surface

| Route (`workers/...`) | Permission |
|---|---|
| `POST alive`, `POST join` | `@Public()` (token / apiKey in the body) |
| `POST join-keys`, `POST join-keys/:id/rotate`, `DELETE join-keys/:id` | `workspace.apikey` |
| `GET /` | `worker.read`. Non-admins are forced to `scope=workspace`, and `scope=cloud` returns 403 for them |
| `GET :id` | `worker.read`. A cloud worker (no workspace) is visible only to admins; otherwise 404 |

- gRPC `WorkersService` (`src/proto/workers.proto`). `Join`, `Alive` (server stream, refresh every 10 s) and `GetManifest` have no guard. `Storage`, `WorkerTelemetry`, `ConnectInternalNetwork`, `BuiltinToolRegistry`, `RemoteExecuteSubscribe` and `RemoteExecuteResult` use `GrpcWorkerTokenGuard`. `Connect` validates the `worker-token` metadata itself.
- Events (`EventBridgeService.publishSafely`): `worker.joined` (with `metadata.joinKeyId`), `worker.rejoined`, `worker.disconnected`, `worker.timed_out`. Only workers with a `workspaceId` are announced; cloud workers are skipped.
- Redis keys: `workers:api:<apiKey>` + `workers:api-id:<id>` (join key, TTL 300 s); `oasm:worker:telemetry:v1:<workerId>` (TTL 90 s, `stale` after 30 s); `agent:conv:worker:<conversationId>` (TTL 1 day).
- Redis channels: publishes `remote-execute:results:<sessionId>`; `worker:stream:cancel` and `worker:stream:jobs` (`WORKER_STREAM_CANCEL_CHANNEL` / `WORKER_STREAM_JOBS_CHANNEL`).
- Exports `WorkersService`, `RemoteExecuteSubscribeService`, `GrpcWorkerContext`, `AliveStreamManager`, `WorkerTelemetryService`, `WorkerStreamRegistry`. The module is `@Global()`.

## Data model

- `workers` (`WorkerInstance`): `token` is stored in plain text and looked up by `IDX_workers_token`. `type` is a `WorkerType`; `scope` is `workspace` or `cloud`; `runMode` is `'cli' | 'node' | null`; `enabledAgentMode`.
- `workspaceId` FK `CASCADE`. `internalNetworkId` FK `CASCADE`: deleting an internal network deletes its workers. `toolId` is set for PROVIDER workers.
- `currentJobsCount`, `toolsCount` and `isOnline` are computed, not columns. Rows are hard-deleted by the sweep.

## Invariants

- **Join order** (`WorkersService.join`). (1) A live join key is consumed with `GETDEL`, so it is single-use; it creates a workspace worker, or resumes the token's worker if that worker is already in the key's workspace. (2) A known token resumes its worker. (3) `OASM_CLOUD_APIKEY` creates a cloud worker (`CLOUD` + `BUILT_IN`, no workspace). (4) Anything else is an `RpcException`.
- **Global worker** means `CLOUD` + `BUILT_IN` (`isGlobalWorker`). PROVIDER workers are cloud-scoped but never global.
- **Agent eligibility** (`servesAgents`): a workspace worker serves its own workspace. A global worker serves agents only if it subscribed with `x-agent-sandbox: 1`. PROVIDER workers never serve agents. `registerWorker` rewrites `enabledAgentMode` on every subscribe.
- **Worker pick order for a conversation** (`pickConversationWorker`): Redis pin → Postgres pin (`agent_conversations.workerId`) → a connected workspace worker → a global one. A new pin is written only after a successful push (`pinConversationWorker`). An out-of-scope pin is cleared.
- A `RemoteExecuteResult` is accepted only from the worker the session's last push went to (`isResultFromAssignedWorker`). Sessions with no recorded push are accepted.
- **Never return `token`.** `getWorkers` passes `ignoreFields: ['token', 'tool']`, and `getWorkerById` builds its DTO field by field.
- **Job release.** When an `Alive` stream drops, `releaseWorkerJobs` sets the worker's IN_PROGRESS jobs to PENDING and clears `workerId`; the row stays. A rejoin (`fallbackWorkerRejoin`) sets them to PENDING but keeps `workerId`.
- **Sweep.** `@Interval(WORKER_TIMEOUT)` (60 s) runs on every replica with no lock. It deletes workers whose `lastSeenAt` is older than 60 s and that have no `Alive` stream **on this instance**, and announces `timed_out` only when the delete affected a row. It then runs `resetStuckAndFailedJobs`: IN_PROGRESS jobs of missing workers and FAILED jobs with `retryCount < JOB_MAX_RETRIES` and an asset go back to PENDING.
- `Storage` serves only files under `<cwd>/public/archived` (a `static/` prefix maps to `public/`). `BuiltinToolRegistry` accepts only `os_arch` matching `^[a-z0-9]+_[a-z0-9]+$`.
- Worker detail lists a connector only when the latest telemetry shows a container for that slug.

## Coupling

- `forwardRef(() => ToolsModule)` (the two modules import each other) and `ConnectorsModule`. `WorkersService` injects `JobsRegistryService` and `ToolsService` with `forwardRef`. This is part of the tools ↔ workers ↔ jobs-registry cycle noted in `combine.module.ts`.
- Writes other modules' tables: `jobs` (through `jobsRegistryService.repo` and raw SQL), `network_interfaces` (`connectInternalNetwork`), and `agent_conversations.workerId` (conversation pin).
- Consumers: `remote-execute`, which wraps `RemoteExecuteSubscribeService`. `agents`, which uses `getWorkers(..., { agentWorkspaceId })`, `isAgentWorkerForWorkspace`, `isAgentReady`, and pick/pin. `jobs-registry`, which uses `WorkerStreamRegistry.publishCancel` / `publishJobsAvailable` and `WorkerInstance`. `src/common/guards/` (`GrpcWorkerTokenGuard`, `WorkerTokenGuard`), which uses `validateWorkerToken`. `ToolsService`, which counts workers through `workersService.repo`.

## Gotchas

- **The in-memory state is per process**: `RemoteExecuteSubscribeService`, `AliveStreamManager`, `WorkerStreamRegistry.outbound`, `GrpcWorkerContext`. A push succeeds only on the instance that holds the worker's subscribe stream. Results, cancels and job hints cross instances through Redis ("broadcast, holder acts"). `isOnline` reflects only the instance that answers the request.
- `GrpcWorkerContext` caches the `WorkerInstance` per token from the last guarded call and is never pruned.
- `RedisService.subscribe` delivers every message to every callback, so each handler must check its own channel.
- The gRPC loader uses `enums: String`. `mapRunMode` and `handleRemoteExecuteResult` accept both enum names and numbers. Image results are base64-encoded; other result types are UTF-8.
- `Connect` must subscribe to the inbound stream synchronously and uses a `ReplaySubject`. It currently carries only register, heartbeat, `cancel` and `jobsAvailable`. Job pull, results and telemetry stay on their own RPCs.
- `getWorkers` (full entity with tool counts, used by agents) differs from `getWorkerList` (light card row, used by `GET /workers`).
- After changing a proto, run `task proto`.

## Testing

Colocated specs: `workers.service`, `workers.controller`, `worker-stream.controller`, `worker-stream-registry`, `remote-execute-subscribe`, `alive-stream-manager`, `worker-join-key`, `worker-telemetry`, `redis-worker-telemetry.store`.
