# audit module

Workspace audit trail: the append-only `audit_events` table, its read/export API, the action catalog, and the 90-day retention job.

## Layout

- `audit.service.ts`: `AuditService` (in-transaction writes, best-effort writes, actor context, GDPR pseudonymization, keyset list and export) plus `encodeCursor` / `decodeCursor`.
- `audit-events.controller.ts`: routes under `workspaces/:id/audit`, `toAuditCsv`.
- `constants/audit-events.ts`: `AUDIT_ACTION_CATALOG` (single source of truth) and the derived `AUDIT_EVENTS`, `AuditAction`, `AUDIT_EVENT_LABELS`, `AUDIT_WIRING`, `AUDIT_EVENTS_RE`.
- `audit-retention.service.ts` + `processors/audit-retention.processor.ts`: archive-then-delete retention.
- `entities/audit-event.entity.ts`, `dto/audit.dto.ts`.

## Public surface

| Route | Permission |
|---|---|
| `GET workspaces/:id/audit` | `audit.read` (`workspaceParam: 'id'`) |
| `GET workspaces/:id/audit/actions` | `audit.read`; returns the catalog, no DB access |
| `GET workspaces/:id/audit/export` | `audit.read`; CSV, max 10,000 rows (400 above) |

- `@Global()` module registered in `app.module.ts` (not `combine.module.ts`). Exports `AuditService` only.
- BullMQ queue `BullMQName.AUDIT_RETENTION`: repeatable job `audit-retention`, pattern `0 1 * * *`, `attempts: 3`, registered in `AuditRetentionService.onModuleInit`.
- The export writes its own `audit.exported` row via `auditSafely` before the CSV is sent; a capped (rejected) export writes nothing.

## Two write paths

1. **Event bus (most actions).** Controllers carry `@PublishEvent(EVENT_CATALOG.x)`; `event-bridge/sinks/audit/audit.sink.ts` (`AuditSink`) materializes events with `EVENT_POLICY[name].persist === true` into `audit_events`, idempotent on `eventId` (`ON CONFLICT DO NOTHING`), as a single exclusive consumer under a Redis lock. This module does not own that code.
2. **`AuditService.recordInTx(manager, input)`** for actions that must commit atomically with the change or need a before-state: `workspace.deleted`, `member.removed`, `member.permissions.updated`, the three `permission_group.*` actions (all in `WorkspacesService`), plus `audit.exported`. These handlers must **not** also carry `@PublishEvent`, or the action gets two rows with different `eventId`s. `auditSafely` wraps it in its own transaction and never throws (`targets.service.ts` uses it too).

## Data model

- `audit_events` (`AuditEvent`, does not extend `BaseEntity`, no `updatedAt`): `eventId` uuid UNIQUE NOT NULL (the CloudEvents id; direct writes mint a random one), nullable `workspaceId`, `occurredAt` timestamptz, actor fields, `action` (≤64), `resourceType` (≤32), `outcome`, `sourceIp` inet, `changes` and `metadata` jsonb.
- Indexes all lead with `workspaceId` (`IDX_ae_workspace_time/_action/_resource/_actor`). No FKs: rows survive deletion of the workspace or user.

## Invariants

- **Append-only is enforced in Postgres**, not in code: trigger `audit_events_no_modify` (statement-level, BEFORE UPDATE/DELETE/TRUNCATE) runs `block_audit_mutation()` from migration `1786800000000-CreateAuditEvents.ts`. It raises unless:
  - UPDATE with `app.audit_pii_sweep = 'on'` (only `pseudonymizeActor` and the `AddEventIdToAuditEvents` backfill), or
  - DELETE with `app.audit_retention = 'on'` (only `AuditRetentionService`),
  - and in both cases the DB user is superuser or a member of role `audit_maintenance`. TRUNCATE is always blocked.
  The GUCs are set with `set_config(..., true)` (transaction-local) inside an explicit transaction. The migration cannot create `audit_maintenance`; ops must provision and grant it, or retention and GDPR sweeps fail for a non-superuser app user.
- Never write `audit_events` with `.save()` on an existing row, `.update()` or `.delete()` anywhere else; it will throw at runtime.
- `changes` and `metadata` go through `redactSecrets` (shared with the event bus in `event-bridge/publishing/redact-secrets.ts`). Metadata values are scalars or string lists only.
- Tenant isolation: `buildEventQuery` always filters on the route `workspaceId`. Lists are `occurredAt DESC, id DESC` with a keyset cursor (base64url of `iso|uuid`, strictly validated, 400 on anything malformed). `limit` is 1–100, default 20.
- CSV export neutralizes formula injection (fields starting with `= + - @ \t \r` get a `'` prefix).
- `buildActorContext(req)`: user session → `AuditActorType.User`; otherwise `ApiKey` with the actor name taken from the MCP API key header (first 64 chars). User agent is capped at 512 chars.
- Retention: archive phase finishes completely (JSONL per day in `AUDIT_ARCHIVE_DIR`, default `./audit-archive`, dir 0o700, files 0o600, resumable via `watermark.json`) before any delete; a write error or corrupt watermark aborts with zero deletes. Deletes run in batches of 5000 in one transaction.

## Adding an audit action

Add one entry to `AUDIT_ACTION_CATALOG` (action, label, controller, method), a matching leaf in `event-bridge/contracts/event-catalog.ts` and `persist: true` in `event-bridge/routing/event-policy.ts`, then decorate the handler. `event-policy.spec.ts` and `event-catalog.spec.ts` fail if the persisted set and the catalog drift. The query DTO validates `action` with `@IsIn(AUDIT_EVENTS)`.

## Coupling

- Callers of `AuditService`: `workspaces.controller.ts` / `workspaces.service.ts` (`recordInTx`, `pseudonymizeActor` after member removal), `targets.controller.ts` / `targets.service.ts`.
- `pseudonymizeActor(actorId)` updates rows by `actorId` with **no workspace filter**: removing a member from one workspace pseudonymizes their rows in every workspace. It runs after the removal commits and its failure is only logged.
- `event-bridge` registers the `AuditEvent` repository and writes the table through `AuditSink`. `projects/project-results.service.ts` reads `audit_events` with raw SQL for project activity.

## Testing

`audit.service.spec.ts`, `audit-events.controller.spec.ts`, `audit-retention.processor.spec.ts`, `audit-wiring-m4-3.spec.ts` (decorator wiring on other modules' controllers), and `audit.module.boot.spec.ts`, which compiles the real DI graph so a missing provider fails the suite instead of prod boot. The trigger itself is not covered by unit tests.
