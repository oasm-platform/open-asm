# event-bridge module

The event bus. Domain events are written as CloudEvents to one Redis Stream (`EVENT_BUS_STREAM = 'oasm:events'`) and read back by one consumer group per lane (`EventBusGroup`). The audit trail, in-app notifications, outbound integrations, project scope/triggers and issue automation are all lanes over this stream. `@Global()`, registered in `app.module.ts` (not `combine.module.ts`).

## Layout

- `publishing/`: `EventBridgeService` (`publish`, `publishSafely`), the `@PublishEvent` decorator, the global `EventPublishInterceptor`, `redactSecrets`.
- `contracts/`: `EVENT_CATALOG` (the only place an event is declared), `EventEnvelopeData` / `ConsumedEvent`, payload types in `event-payloads.ts` (`readPayload`).
- `routing/`: `EVENT_POLICY` (`persist`, `severity` per event) and `SUBSCRIPTIONS` (domains per lane).
- `transport/stream-codec.ts`: `toStreamFields`, `readEvent`, `parseData`. The one place that knows the entry layout.
- `consuming/`: `StreamConsumer` (loop, retry, DLQ, lock), `EventConsumersService` (one consumer per sink), `EventSink` interface, Redis idempotency helpers.
- `sinks/<lane>/`: what each lane does. `sinks/shared/run-steps.ts` holds wording shared by notifications and integrations.

## Public surface

- Exports `EventBridgeService`, `EVENT_CATALOG_TOKEN` and `NotificationsSink` (used by `NotificationsService`). No HTTP routes.
- `EventPublishInterceptor` is registered here as `APP_INTERCEPTOR`, so `@PublishEvent(EVENT_CATALOG.<path>, config)` works on any controller handler in the app.
- Lanes (`SINKS` in `event-bridge.module.ts`):

| Group | Domains | Handles | Effect | Idempotency |
|---|---|---|---|---|
| `audit` | `*` | `isPersisted(name)` | insert `audit_events` | `orIgnore` on unique `eventId`; exclusive Redis lock `EVENT_BUS_AUDIT_LOCK_KEY` |
| `projection` | 7 domains | nothing (`accepts` returns false) | placeholder for future read models | n/a |
| `notifications` | 8 domains | keys of `NOTIFICATION_RULES` | `notifications` rows + pub/sub `notification:<userId>` | `claimEventOnce` per `<eventId>:<type>` |
| `integrations` | 6 domains | `isPushable` | connectors of TICKETING / NOTIFICATION integrations | `claimEventOnce(eventId)`; `eventId` is sent to receivers |
| `projects` | asset, project, vulnerability | `asset.discovered`, `project.assets.added`, `project.run.completed`, `vulnerability.detected` | `PROJECT_ASSET_DISCOVERY` / `PROJECT_TRIGGER_EVENTS` | trigger events: `wasEventHandled` then `markEventHandled` after the work |
| `issues` | vulnerability | `vulnerability.detected`, `.resurfaced`, `.fixed` | `ISSUE_VULNERABILITY_EVENTS` | same check-then-mark |

- Redis keys: stream `oasm:events` (`MAXLEN` 100k, 7-day `EXPIRE` refreshed on every write), DLQ `oasm:events:dlq:<workspaceId>`, markers `event-bus:handled:<group>:<key>` (7 days).

## Invariants

- **Only catalog names travel.** `publish` logs and returns null for a name not in `EVENT_CATALOG`; consumers ack unknown types. A new event needs a catalog leaf **and** an `EVENT_POLICY` entry (`Record<EventName, …>` fails the build without it), and `event-catalog.spec.ts` asserts the leaf count (114 today).
- **Every entry needs `data.workspaceId` and `data.outcome`.** `parseData` drops anything else, so every lane acks it unread and `/events/stream` does not forward it. The interceptor fills both. Direct `publish` / `publishSafely` callers must set `outcome` themselves (usually `AuditOutcome.Success`) and an `actor` (`AuditActorType.System` for background work).
- **Redaction happens only in the interceptor** (and again in `AuditSink`). `EventBridgeService.publish` does not redact, so direct callers must keep secrets out of `payload` / `metadata`.
- Interceptor rules: no session user and no MCP API key header → no event. No workspace (request `workspaceId` or `config.workspaceId(result)`) → skipped, never a sentinel. A throwing extractor skips the publish. A failed handler still publishes, with `outcome: failure` and the route `:id` as `resourceId`. `persist: true` events are awaited with `publish`, the rest use `publishSafely`. The response is never changed by the event path.
- Delivery is at-least-once. A sink that throws leaves the entry pending; `XAUTOCLAIM` redelivers it after `EVENT_BUS_CLAIM_MIN_IDLE_MS` (30 s); after `EVENT_BUS_MAX_ATTEMPTS` (5) it goes to the workspace DLQ and is acked. A permanently bad event must make the sink return, not throw. Every sink must be idempotent.
- A group is created from `0` at boot and recreated from `0` on `NOGROUP` (stream evicted or expired), so a new lane replays the whole retained stream.
- Only `audit` is exclusive. Every other lane runs on every replica.
- `notifications` must never subscribe to the `notification` domain (it would consume its own output).

## Coupling

- Imports `ServicesModule` (Redis, `RedisLockService`) and `IntegrationsModule`; registers `AuditEvent`, `Notification`, `NotificationRecipient`, `User` and writes `audit_events`, `notifications`, `notification_recipients` directly.
- The `projects` and `issues` lanes inject DI tokens provided by the global `ProjectsModule` and `IssuesModule` (`useExisting` on `ProjectsService`, `ProjectTriggersService`, `IssueAutomationService`). They are tokens so loading the bridge does not load those service graphs.
- The events module imports `NOTIFICATION_CHANNEL_PREFIX` and `parseData`; the notifications module injects `NotificationsSink.deliver`.
- Over a dozen services publish directly (projects, vulnerabilities, data-adapter, workers, issues, comments, agents tools, …) and over a dozen controllers use `@PublishEvent`. Grep `publishSafely(` and `@PublishEvent` before changing an envelope field.
- The 47 persisted names mirror the audit module's action catalog; `event-catalog.spec.ts` asserts parity. Some audit rows bypass the bus entirely: `AuditService` writes them inside the caller's transaction (workspace delete, member removal/permissions, permission groups, `audit.exported`). Do not also decorate those handlers, or the action gets two rows.
- In-process `EventEmitter2` events (`EventTriggerType.WORKFLOW_END`, `project.deleting`, target events for `TriggerWorkflowService`) are a separate mechanism and never reach the stream.

## Gotchas

- Counts in the header comments of `event-catalog.ts` and `event-policy.ts` (86, 85, 47, 35) and the `connectors/event.ts` / `event.spec.ts` file names they mention are stale. Trust the spec.
- `@PublishEvent` only works on HTTP controller handlers: the interceptor reads the request. On a service method it does nothing. `PublishEventConfig.actor` is never read; the actor always comes from the request.
- A delete handler whose result has no id needs `resourceIdFromRoute: true`, or the success event has no `resourceId`.
- `IntegrationsSink` claims the event before pushing, and a failing endpoint is only logged. Integration delivery is best-effort and is not retried.
- `ProjectionSink` must stay registered even though it does nothing: reading a group that does not exist is an error.

## Testing

Specs sit next to the code (`publishing/`, `consuming/`, `routing/`, `contracts/`, most sinks). `event-bridge.module.boot.spec.ts` checks that every `EventBusGroup` has a sink wired into `EVENT_SINKS`. `consuming/stream-consumer.spec.ts` covers ack, retry and DLQ with a stub sink. There are no specs for `EventConsumersService`, `ProjectionSink`, `IntegrationsSink` itself or `stream-codec.ts`.
