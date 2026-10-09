import type { EventName } from '../connectors/event';
import { EventBusGroup } from '@/common/enums/enum';

/**
 * Routing metadata for every catalog event, kept OUT of `event.ts` on purpose.
 *
 * `connectors/event.ts` is the wire contract: the catalog tree, the name union,
 * the lookups. Adding a field to `EventLeaf` would mean editing 86 object
 * literals and the shape assertions in `event.spec.ts` for information that no
 * producer needs. Routing is a separate concern, so it lives here, and the
 * compiler enforces that it stays complete: `Record<EventName, EventPolicy>`
 * makes a missing key a build error rather than an event that silently stops
 * being audited.
 *
 * `persist: true` is what makes an event a row in `audit_events` — it replaces
 * `AUDIT_ACTION_CATALOG` as the source of truth for "is this audit-worthy"
 * once this map covers all 35 audit names.
 */
export interface EventPolicy {
  /** `true` ⇒ the audit sink materializes this event into `audit_events`. */
  persist: boolean;
  /** Routing weight for the notification / email groups. */
  severity: 'normal' | 'important' | 'critical';
}

/**
 * One entry per catalog leaf. `Record<EventName, …>` is the exhaustiveness
 * check — a new catalog leaf without a policy here fails `task api:build`.
 *
 * `persist` mirrors the audit trail the app had before the event bus: the 35
 * `AUDIT_ACTION_CATALOG` names are `true`, and the runtime-only leaves
 * (`scan.*`, `issue.*`, `worker.*`, `notification.*`, `statistics.aggregated`,
 * `system_config.cleaned`, `storage.object.deleted`) are `false` because they
 * are operational signals rather than user-attributable actions.
 */
export const EVENT_POLICY: Record<EventName, EventPolicy> = {
  // ─── Audit trail (35, mirrors AUDIT_ACTION_CATALOG one-for-one) ───────────
  'workspace.created': { persist: true, severity: 'important' },
  'workspace.updated': { persist: true, severity: 'normal' },
  'workspace.deleted': { persist: true, severity: 'critical' },
  'workspace.config.updated': { persist: true, severity: 'normal' },
  'workspace.api_key.rotated': { persist: true, severity: 'critical' },
  'member.invited': { persist: true, severity: 'important' },
  'member.invitation.cancelled': { persist: true, severity: 'normal' },
  'member.removed': { persist: true, severity: 'critical' },
  'member.permissions.updated': { persist: true, severity: 'critical' },
  'permission_group.created': { persist: true, severity: 'important' },
  'permission_group.updated': { persist: true, severity: 'important' },
  'permission_group.deleted': { persist: true, severity: 'important' },
  'target.created': { persist: true, severity: 'normal' },
  'target.updated': { persist: true, severity: 'normal' },
  'target.deleted': { persist: true, severity: 'important' },
  'asset.deleted': { persist: true, severity: 'normal' },
  'asset_group.created': { persist: true, severity: 'normal' },
  'asset_group.deleted': { persist: true, severity: 'normal' },
  'network.created': { persist: true, severity: 'normal' },
  'network.deleted': { persist: true, severity: 'important' },
  'vulnerability.status.updated': { persist: true, severity: 'normal' },
  'vulnerability.bulk_updated': { persist: true, severity: 'normal' },
  'report.generated': { persist: true, severity: 'normal' },
  'report.exported': { persist: true, severity: 'important' },
  'report.deleted': { persist: true, severity: 'normal' },
  'job.cancelled': { persist: true, severity: 'normal' },
  'workflow.created': { persist: true, severity: 'normal' },
  'workflow.updated': { persist: true, severity: 'normal' },
  'workflow.deleted': { persist: true, severity: 'important' },
  'integration.connected': { persist: true, severity: 'important' },
  'integration.disconnected': { persist: true, severity: 'normal' },
  'integration.settings.updated': { persist: true, severity: 'normal' },
  'api_key.created': { persist: true, severity: 'important' },
  'api_key.revoked': { persist: true, severity: 'important' },
  'audit.exported': { persist: true, severity: 'important' },

  // ─── Runtime events ──────────────────────────────────────────────────────
  // `persist: false` on all of them: they are operational signals, not the 35
  // user-attributable actions the audit trail declared. A workflow run closing
  // is visible through `job.completed`/`job.failed` already.
  'workflow.run.started': { persist: false, severity: 'normal' },
  'workflow.run.completed': { persist: false, severity: 'normal' },
  'workflow.run.failed': { persist: false, severity: 'important' },
  'workflow.run.cancelled': { persist: false, severity: 'normal' },
  'workflow.run.retriggered': { persist: false, severity: 'normal' },
  'vulnerability.dismissed': { persist: false, severity: 'normal' },
  'vulnerability.reopened': { persist: false, severity: 'normal' },
  'vulnerability.detected': { persist: false, severity: 'important' },
  'vulnerability.analysis.started': { persist: false, severity: 'normal' },
  'vulnerability.analysis.completed': { persist: false, severity: 'normal' },
  'vulnerability.analysis.failed': { persist: false, severity: 'normal' },
  'audit.retention.purged': { persist: false, severity: 'normal' },
  'target.scan.completed': { persist: false, severity: 'normal' },
  'target.discovered': { persist: false, severity: 'normal' },
  'asset.discovered': { persist: false, severity: 'important' },
  'asset.updated': { persist: false, severity: 'normal' },
  'asset.enabled_changed': { persist: false, severity: 'normal' },
  'job.created': { persist: false, severity: 'normal' },
  'job.started': { persist: false, severity: 'normal' },
  'job.completed': { persist: false, severity: 'normal' },
  'job.failed': { persist: false, severity: 'important' },
  'job.skipped': { persist: false, severity: 'normal' },
  'job.retried': { persist: false, severity: 'normal' },
  'job.released': { persist: false, severity: 'normal' },
  'job.reset_stuck': { persist: false, severity: 'normal' },
  'job.result.cleaned': { persist: false, severity: 'normal' },
  'integration.sync.started': { persist: false, severity: 'normal' },
  'integration.sync.succeeded': { persist: false, severity: 'normal' },
  'integration.sync.failed': { persist: false, severity: 'important' },
  'integration.ticket.created': { persist: false, severity: 'normal' },

  // Worker lifecycle is state transitions ONLY — there is no `worker.alive`
  // leaf, because liveness is read from `workers.lastSeenAt` +
  // `AliveStreamManager` and pushed as a bare timestamp update. A heartbeat
  // on the stream would let it crowd out the audit trail inside MAXLEN.
  'worker.joined': { persist: false, severity: 'normal' },
  'worker.disconnected': { persist: false, severity: 'normal' },
  'worker.timed_out': { persist: false, severity: 'normal' },
  'worker.rejoined': { persist: false, severity: 'normal' },
  'worker.network.connected': { persist: false, severity: 'normal' },
  'worker.agent_mode.enabled': { persist: false, severity: 'normal' },

  'scan.schedule.created': { persist: false, severity: 'normal' },
  'scan.schedule.updated': { persist: false, severity: 'normal' },
  'scan.schedule.deleted': { persist: false, severity: 'normal' },
  'scan.schedule.fired': { persist: false, severity: 'normal' },

  'issue.created': { persist: false, severity: 'normal' },
  'issue.opened': { persist: false, severity: 'normal' },
  'issue.closed': { persist: false, severity: 'normal' },
  'issue.comment.created': { persist: false, severity: 'normal' },
  'issue.comment.updated': { persist: false, severity: 'normal' },

  'statistics.aggregated': { persist: false, severity: 'normal' },
  'system_config.cleaned': { persist: false, severity: 'normal' },
  'storage.object.deleted': { persist: false, severity: 'normal' },
  // Read by group `audit` for metrics only — the `notifications` group must NOT
  // consume domain `notification`, or it would loop on its own output.
  'notification.sent': { persist: false, severity: 'normal' },
  'notification.failed': { persist: false, severity: 'normal' },
};

/** Audit sink filter: does this event belong in `audit_events`? */
export function isPersisted(name: EventName): boolean {
  return EVENT_POLICY[name]?.persist === true;
}

/** Routing weight, used by the notification / email groups. */
export function eventSeverity(name: EventName): EventPolicy['severity'] {
  return EVENT_POLICY[name]?.severity ?? 'normal';
}

/**
 * Which domains each consumer group cares about — the SINGLE place a lane's
 * subscription is declared.
 *
 * The values are real domains (`name.split('.')[0]`), never invented lanes.
 * `'*'` means "every domain, filtered further by `persist`", which is what the
 * audit sink needs: it is the materialized view of the trail, so its interest
 * is expressed by POLICY rather than by a domain list.
 *
 * Deliberate omissions:
 *  - `notifications` does NOT consume the `notification` domain. It EMITS
 *    `notification.sent`/`notification.failed`, so consuming them would be a
 *    self-feeding loop; those two leaves are read by `audit` and by metrics.
 *  - the group is named `integrations` (plural) but consumes the `integration`
 *    domain (singular, per the catalog). The asymmetry is intentional.
 *
 * Filters finer than a domain (e.g. "only `asset.discovered` notifies") belong
 * at the top of the handler, not here: this table is the TRANSPORT's routing,
 * and keeping content decisions out of it is what stops it from becoming a
 * second, half-tested copy of the business rules.
 */
export const SUBSCRIPTIONS = {
  [EventBusGroup.Audit]: '*',
  [EventBusGroup.Projection]: [
    'vulnerability',
    'asset',
    'issue',
    'job',
    'workflow',
    'scan',
    'statistics',
  ],
  [EventBusGroup.Notifications]: [
    'vulnerability',
    'asset',
    'issue',
    'job',
    'workflow',
    'worker',
    'scan',
    'integration',
  ],
  [EventBusGroup.Integrations]: [
    'vulnerability',
    'asset',
    'issue',
    'job',
    'workflow',
    'integration',
  ],
  // No `email` lane: it has no transport to send through, so a subscription
  // here would only promise delivery that cannot happen. Add the lane and this
  // entry together when a provider exists.
} as const satisfies Record<EventBusGroup, '*' | readonly string[]>;