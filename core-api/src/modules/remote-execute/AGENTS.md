# remote-execute module

Lets the AI agent run a shell command or a single connector tool on a worker and wait for its output. No HTTP, no gRPC, no tables.

## Layout

- `remote-execute.module.ts`: imports `WorkersModule` and provides and exports `RemoteExecuteService`. Not `@Global()`.
- `remote-execute.service.ts`: `RemoteExecuteService`, `RemoteCommandResult`, `REMOTE_OUTPUT_MAX_CHARS` (10 MiB).
- `remote-execute.service.spec.ts`: unit tests.

## Public surface

- `waitForResult(command, sessionId, conversationId, workspaceId, timeoutMs = 60_000, onEvent?, abortSignal?)` runs an agent shell command (`agents/tools/remote-execute.tool.ts`). The worker is picked by `RemoteExecuteSubscribeService.pushCommandWithConversation`: the conversation's pin, else a workspace worker, else a sandboxed global worker.
- `waitForToolRun(workerId, toolRun, sessionId, timeoutMs, options)` runs one connector tool on an explicit worker (`agents/tools/connector.tools.ts`). It is **not a job**: nothing is written to the database, and the result's `command` is `<tool> <target>` for display only.

## How a call works

1. Subscribe to Redis `remote-execute:results:<sessionId>` **before** pushing, so a fast command cannot finish before the subscription exists.
2. Push through `RemoteExecuteSubscribeService` (workers module). A `null` push (no eligible or connected worker) throws `ServiceUnavailableException('No available worker for remote execution')`.
3. The worker answers through gRPC `RemoteExecuteResult`. `WorkersController` drops results from a worker the session was not assigned to. `WorkersService.handleRemoteExecuteResult` republishes them to the channel as JSON `{id, sessionId, type, data, exitCode}`.
4. Collect until the first EXIT or ERROR, a timeout, or an abort. Then unsubscribe and call `removeSession(sessionId)`.

## Invariants

- Event types: 1 stdout, 2 stderr, 3 exit, 4 error, 5 image. Both numbers and proto names (`REMOTE_EXECUTE_RESULT_*`) are accepted; unknown types are skipped.
- stdout and stderr are each capped at `maxOutputChars`. Only stdout sets `stdoutTruncated`; stderr is cut silently. An IMAGE event (base64 JPEG) is kept only as `result.image` and is not passed to `onEvent`.
- Timeout gives `timedOut: true`. An abort gives `error: 'Cancelled by user'` and `timedOut: false`. An abort that happens before the push means nothing is pushed.
- `waitForToolRun` sends `pushCancelToolRun` when it stops waiting (timeout or abort). `waitForResult` sends no cancel for shell commands.
- If the worker disconnects during a tool run, `RemoteExecuteSubscribeService.handleWorkerDisconnect` publishes a synthetic ERROR so the waiter returns at once. A shell command waits out its timeout instead.
- `onPushed` (for example pinning the conversation) runs after a successful push. Exceptions from it, and from `onEvent`, are logged and swallowed. An EXIT that arrives while `onPushed` runs is still handled.

## Coupling

- Depends only on `RemoteExecuteSubscribeService` (workers module) and the global `RedisService`. All worker selection, conversation pinning and the agent-eligibility rules live in the workers module.
- Imported by `agents.module.ts` and `combine.module.ts`. Agents also inject `RemoteExecuteSubscribeService` directly for `pickConversationWorker` / `pinConversationWorker` / `isAgentReady`.

## Gotchas

- A push works only on the core-api instance that holds the worker's `RemoteExecuteSubscribe` stream, because that registry is in memory. Results reach the waiting instance through Redis.
- `RedisService.subscribe` callbacks receive messages from every channel, so the handler must keep its `ch !== channel` check.
