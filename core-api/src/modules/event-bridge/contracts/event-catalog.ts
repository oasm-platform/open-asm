/**
 * Event catalog for the Redis Stream event bridge.
 *
 * SINGLE SOURCE OF TRUTH: every event the bridge can carry is declared exactly
 * once, as a leaf in `EVENT_CATALOG`. The tree mirrors the dot structure of
 * the wire name, so the path IS the name:
 *
 *   EVENT_CATALOG.job.completed        // → { name: 'job.completed', … }
 *   EVENT_CATALOG.workspace.config.updated
 *
 * A leaf is a HANDLE, not just documentation: `publish(EVENT_CATALOG.job.completed,
 * payload)` is the intended call shape, so the compiler rejects a path that
 * does not exist and a consumer cannot invent an event nobody declared.
 *
 * `name` is spelled twice per event — once in the path, once in the leaf — and
 * that is deliberate rather than redundant. Once the leaf is passed to
 * `publish()`, the runtime has no way to recover the path it came from, so the
 * name has to travel inside the value. `event.spec.ts` asserts the two copies
 * agree for all 85 events, so the duplication cannot rot.
 *
 * Naming contract: `<domain>.<action>` (or `<domain>.<sub_resource>.<action>`,
 * e.g. `workspace.config.updated`), lowercase, snake_case, past tense for
 * completions. This mirrors the audit trail's `resource.action` contract
 * (`audit-events.ts` → `AUDIT_EVENTS_RE`) so one mental model covers both, and
 * it stays compatible with the existing `EventEmitter2` convention that
 * `TriggerWorkflowService` parses by splitting on the first dot.
 *
 * The 35 audit-mirrored entries deliberately redeclare the audit action names
 * instead of importing `AUDIT_ACTION_CATALOG`: the bridge must not take a
 * compile-time dependency on the audit module. `event.spec.ts` asserts the two
 * stay in lockstep, so drift fails CI rather than production.
 */

/**
 * Envelope/payload shape version. Bump ONLY on a breaking change (a removed or
 * retyped field); additive optional fields do not bump it, so consumers can
 * keep parsing v1 events after v2 appears in the same stream.
 */
export const EVENT_SCHEMA_VERSION = 1;

/**
 * Terminal node: the end of an event name, and the handle handed to `publish`.
 *
 * `name` must equal the dotted path that reaches this leaf. `summary` is what
 * the event means. A node carrying `summary` is a leaf; anything else is a
 * sub-resource level to keep descending. `event.spec.ts` asserts no catalog key
 * is named `summary`, which is what makes that discrimination unambiguous.
 */
export interface EventLeaf {
  /** Wire name, e.g. `job.completed`. Must match the path to this leaf. */
  readonly name: string;
  readonly summary: string;
}

/** Any level of the catalog tree: a leaf, or more name segments below it. */
export interface EventNode {
  readonly [key: string]: EventLeaf | EventNode;
}

/**
 * A catalog entry widened for transport and for the catalog endpoint: the wire
 * name paired with its description, both as plain strings. This is the shape
 * `EVENT_DEFINITIONS` holds; it is deliberately NOT what `publish` accepts,
 * because a widened `name: string` would let any name through the type system.
 */
export interface EventDefinition {
  readonly name: string;
  readonly summary: string;
}

/**
 * Every event the bridge carries, grouped by domain.
 *
 * `as const` keeps the tree literal so `EventName` and `CatalogEvent` can be
 * derived from the keys; `satisfies` type-checks the tree's shape.
 */
export const EVENT_CATALOG = {
  // ─── Audit trail (35) ───────────────────────────────────────────────────
  // Mirrors AUDIT_ACTION_CATALOG one-for-one. Emitted from the existing
  // @AuditLog decorator + global AuditInterceptor, so hooking the bridge into
  // AuditService costs zero controller changes.
  workspace: {
    created: { name: 'workspace.created', summary: 'Workspace created' },
    updated: { name: 'workspace.updated', summary: 'Workspace updated' },
    deleted: { name: 'workspace.deleted', summary: 'Workspace deleted' },
    config: {
      updated: {
        name: 'workspace.config.updated',
        summary: 'Workspace configuration updated',
      },
    },
    api_key: {
      rotated: {
        name: 'workspace.api_key.rotated',
        summary: 'Workspace API key rotated',
      },
    },
  },
  member: {
    invited: { name: 'member.invited', summary: 'Members invited to a workspace' },
    invitation: {
      cancelled: {
        name: 'member.invitation.cancelled',
        summary: 'Workspace invitation cancelled',
      },
    },
    removed: {
      name: 'member.removed',
      summary: 'Member removed from workspace',
    },
    permissions: {
      updated: {
        name: 'member.permissions.updated',
        summary: 'Member permissions changed',
      },
    },
  },
  permission_group: {
    created: {
      name: 'permission_group.created',
      summary: 'Permission group created',
    },
    updated: {
      name: 'permission_group.updated',
      summary: 'Permission group updated',
    },
    deleted: {
      name: 'permission_group.deleted',
      summary: 'Permission group deleted',
    },
  },
  target: {
    created: { name: 'target.created', summary: 'Scan target created' },
    updated: { name: 'target.updated', summary: 'Scan target updated' },
    deleted: { name: 'target.deleted', summary: 'Scan target deleted' },
    // From the scheduled re-scan path, not the audit trail.
    scan: {
      completed: {
        name: 'target.scan.completed',
        summary: 'Scheduled target re-scan finished',
      },
    },
    // From an integration sync importing a target.
    discovered: {
      name: 'target.discovered',
      summary: 'Target imported by an integration sync',
    },
  },
  asset: {
    deleted: { name: 'asset.deleted', summary: 'Asset deleted' },
    // From the job result sync, not the audit trail.
    discovered: {
      name: 'asset.discovered',
      summary: 'New asset discovered by a scan',
    },
    updated: {
      name: 'asset.updated',
      summary: 'Asset attributes refreshed from scan data',
    },
    enabled_changed: {
      name: 'asset.enabled_changed',
      summary: 'Asset enabled or disabled',
    },
  },
  asset_group: {
    created: { name: 'asset_group.created', summary: 'Asset group created' },
    deleted: { name: 'asset_group.deleted', summary: 'Asset group deleted' },
  },
  network: {
    created: { name: 'network.created', summary: 'Internal network created' },
    deleted: { name: 'network.deleted', summary: 'Internal network deleted' },
  },
  vulnerability: {
    status: {
      updated: {
        name: 'vulnerability.status.updated',
        summary: 'Vulnerability status changed',
      },
    },
    bulk_updated: {
      name: 'vulnerability.bulk_updated',
      summary: 'Vulnerabilities bulk updated',
    },
    dismissed: {
      name: 'vulnerability.dismissed',
      summary: 'Vulnerability dismissed',
    },
    reopened: {
      name: 'vulnerability.reopened',
      summary: 'Vulnerability reopened',
    },
    detected: {
      name: 'vulnerability.detected',
      summary: 'New vulnerability found',
    },
    analysis: {
      started: { name: 'vulnerability.analysis.started', summary: 'AI analysis started' },
      completed: {
        name: 'vulnerability.analysis.completed',
        summary: 'AI analysis completed',
      },
      failed: {
        name: 'vulnerability.analysis.failed',
        summary: 'AI analysis failed',
      },
    },
  },
  report: {
    generated: { name: 'report.generated', summary: 'Report generated' },
    exported: { name: 'report.exported', summary: 'Report exported' },
    deleted: { name: 'report.deleted', summary: 'Report deleted' },
  },
  // `cancelled` is the audited action; the rest are job transitions that never
  // reached the audit trail. `reset_stuck` needs a hook added — today the
  // sweep is raw SQL in WorkersService.resetStuckAndFailedJobs.
  job: {
    cancelled: { name: 'job.cancelled', summary: 'Job cancelled' },
    created: { name: 'job.created', summary: 'Job row created in PENDING' },
    started: { name: 'job.started', summary: 'Job picked up by a worker' },
    completed: {
      name: 'job.completed',
      summary: 'Job completed successfully',
    },
    failed: { name: 'job.failed', summary: 'Job failed after final attempt' },
    // Derived at read time only — a later completed step implies the earlier
    // pending one never ran.
    skipped: {
      name: 'job.skipped',
      summary: 'Job skipped because a later step completed',
    },
    retried: { name: 'job.retried', summary: 'Job requeued for a new attempt' },
    released: {
      name: 'job.released',
      summary: 'Job released by a worker going away',
    },
    reset_stuck: {
      name: 'job.reset_stuck',
      summary: 'Stuck or failed jobs swept back to PENDING',
    },
    result: {
      cleaned: {
        name: 'job.result.cleaned',
        summary: 'Stale job results removed from storage',
      },
    },
  },
  // A "run" is a JobHistory row: created when the first job of a batch is
  // queued, closed by markWorkflowDone / cancelJobHistory. `run.failed` does
  // not exist yet — today a failed run is only derivable from its jobs.
  workflow: {
    created: {
      name: 'workflow.created',
      summary: 'Workflow definition created',
    },
    updated: {
      name: 'workflow.updated',
      summary: 'Workflow definition updated',
    },
    deleted: {
      name: 'workflow.deleted',
      summary: 'Workflow definition deleted',
    },
    run: {
      started: { name: 'workflow.run.started', summary: 'Workflow run started' },
      completed: {
        name: 'workflow.run.completed',
        summary: 'Workflow run completed',
      },
      failed: {
        name: 'workflow.run.failed',
        summary: 'Workflow run finished with failed jobs',
      },
      cancelled: {
        name: 'workflow.run.cancelled',
        summary: 'Workflow run cancelled',
      },
      retriggered: {
        name: 'workflow.run.retriggered',
        summary: 'Workflow run started again by a new trigger',
      },
    },
  },
  integration: {
    connected: {
      name: 'integration.connected',
      summary: 'Integration connected',
    },
    disconnected: {
      name: 'integration.disconnected',
      summary: 'Integration disconnected',
    },
    settings: {
      updated: {
        name: 'integration.settings.updated',
        summary: 'Integration settings updated',
      },
    },
    sync: {
      started: {
        name: 'integration.sync.started',
        summary: 'Integration sync started',
      },
      succeeded: {
        name: 'integration.sync.succeeded',
        summary: 'Integration sync completed',
      },
      failed: {
        name: 'integration.sync.failed',
        summary: 'Integration sync failed',
      },
    },
    ticket: {
      created: {
        name: 'integration.ticket.created',
        summary: 'Ticket pushed to a tracking integration',
      },
    },
  },
  api_key: {
    created: { name: 'api_key.created', summary: 'API key created' },
    revoked: { name: 'api_key.revoked', summary: 'API key revoked' },
  },
  audit: {
    exported: { name: 'audit.exported', summary: 'Audit log exported' },
    retention: {
      purged: {
        name: 'audit.retention.purged',
        summary: 'Audit retention job archived old rows',
      },
    },
  },

  // ─── Runtime events (50) ────────────────────────────────────────────────
  // NOTE: there is deliberately NO `worker.alive` leaf. Worker liveness is not
  // a state transition — it is a heartbeat, read from `workers.lastSeenAt` and
  // `AliveStreamManager`, and pushed over `POST /workers/alive` + the gRPC
  // stream, both of which only update a timestamp. Publishing it would put a
  // per-worker-per-minute event on the same stream as the audit trail, where
  // MAXLEN makes it the entry most likely to evict the events that matter.
  worker: {
    joined: { name: 'worker.joined', summary: 'Worker joined the cluster' },
    disconnected: {
      name: 'worker.disconnected',
      summary: 'Worker gRPC stream dropped',
    },
    timed_out: {
      name: 'worker.timed_out',
      summary: 'Worker removed after missing heartbeats',
    },
    rejoined: {
      name: 'worker.rejoined',
      summary: 'Worker rejoined and reclaimed its jobs',
    },
    network: {
      connected: {
        name: 'worker.network.connected',
        summary: 'Worker attached to an internal network',
      },
    },
    agent_mode: {
      enabled: {
        name: 'worker.agent_mode.enabled',
        summary: 'Worker switched to agent mode',
      },
    },
  },
  scan: {
    schedule: {
      created: {
        name: 'scan.schedule.created',
        summary: 'Recurring scan schedule created',
      },
      updated: {
        name: 'scan.schedule.updated',
        summary: 'Recurring scan schedule changed',
      },
      deleted: {
        name: 'scan.schedule.deleted',
        summary: 'Recurring scan schedule removed',
      },
      fired: {
        name: 'scan.schedule.fired',
        summary: 'Recurring scan schedule triggered',
      },
    },
  },
  issue: {
    created: { name: 'issue.created', summary: 'Issue created' },
    opened: { name: 'issue.opened', summary: 'Issue reopened' },
    closed: { name: 'issue.closed', summary: 'Issue closed' },
    comment: {
      created: {
        name: 'issue.comment.created',
        summary: 'Comment added to an issue',
      },
      updated: {
        name: 'issue.comment.updated',
        summary: 'Issue comment edited',
      },
    },
  },
  statistics: {
    aggregated: {
      name: 'statistics.aggregated',
      summary: 'Daily statistics rollup completed',
    },
  },
  system_config: {
    cleaned: {
      name: 'system_config.cleaned',
      summary: 'Expired system configs removed',
    },
  },
  storage: {
    object: {
      deleted: {
        name: 'storage.object.deleted',
        summary: 'Object deleted from storage',
      },
    },
  },
  notification: {
    sent: { name: 'notification.sent', summary: 'Notification delivered' },
    failed: { name: 'notification.failed', summary: 'Notification delivery failed' },
  },
} as const satisfies EventNode;

/**
 * Dotted wire name of every leaf, walked out of the literal tree.
 *
 * A node is a leaf when it carries `summary`; anything else is a name segment
 * to keep descending. The `infer … extends string` step keeps the compiler
 * happy about interpolating the recursive result into a template literal.
 */
type DottedNames<T> = {
  [K in keyof T & string]: T[K] extends EventLeaf
    ? K
    : DottedNames<T[K]> extends infer R extends string
      ? `${K}.${R}`
      : never;
}[keyof T & string];

/** Every leaf VALUE, literals intact — the type `publish` accepts. */
type LeafValues<T> = {
  [K in keyof T & string]: T[K] extends EventLeaf
    ? T[K]
    : LeafValues<T[K]>;
}[keyof T & string];

/**
 * Union of every catalog name — what the stream carries and what an untyped
 * value is validated against. A literal union (not `string`) is the point:
 * `publish('job.startd')` is a compile error, not a dropped message.
 */
export type EventName = DottedNames<typeof EVENT_CATALOG>;

/**
 * A catalog leaf with its `name` and `summary` still as literals. This, not
 * the widened `EventDefinition`, is what `publish` takes — a leaf obtained by
 * dot-path is the only way to name an event, so a hand-rolled
 * `{ name: 'typo', summary: '' }` is rejected by the compiler rather than
 * written to the stream.
 */
export type CatalogEvent = LeafValues<typeof EVENT_CATALOG>;

/** Runtime view of the tree, for the recursive walk below. */
type WalkableNode = { [key: string]: WalkableNode | EventLeaf };

const isLeaf = (value: WalkableNode | EventLeaf): value is EventLeaf =>
  typeof (value as EventLeaf).summary === 'string';

function collect(
  node: WalkableNode,
  prefix: string,
  out: EventDefinition[],
): void {
  for (const [key, value] of Object.entries(node)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (isLeaf(value)) {
      out.push({ name, summary: value.summary });
    } else {
      collect(value, name, out);
    }
  }
}

/**
 * The catalog flattened to name+summary pairs, in declaration order. Built once
 * at module load (85 leaves — a single cheap pass) and shared by every lookup.
 *
 * Names come from the PATH, never from `leaf.name`, so this list stays correct
 * even if a leaf's own name were ever mistyped — `event.spec.ts` is what
 * reports the mismatch.
 */
export const EVENT_DEFINITIONS: readonly EventDefinition[] = (() => {
  const out: EventDefinition[] = [];
  collect(EVENT_CATALOG, '', out);
  return out;
})();

/** Every event name, in catalog order. */
export const EVENT_NAMES: readonly EventName[] = EVENT_DEFINITIONS.map(
  (entry) => entry.name as EventName,
);

/** Catalog entry for a name, or undefined when the name is not in the catalog. */
export function getEventDefinition(
  name: string,
): EventDefinition | undefined {
  return EVENT_DEFINITIONS.find((entry) => entry.name === name);
}

/**
 * Normalizes either call shape into the wire name. Accepts a catalog leaf
 * (`publish(EVENT_CATALOG.job.completed, …)`) or a bare name
 * (`publish(action, …)`, for values that arrived untyped from a queue or a
 * Redis entry). Returns undefined for an unknown name so the caller can drop
 * the event instead of writing a nameless one.
 */
export function resolveEventName(
  event: CatalogEvent | string,
): EventName | undefined {
  const name = typeof event === 'string' ? event : event.name;
  return isEventName(name) ? name : undefined;
}

/**
 * Runtime guard for values that crossed a trust boundary (HTTP body, queue
 * payload, Redis entry). The type system cannot check those, so the bridge
 * validates before writing an event nobody declared.
 */
export function isEventName(value: string): value is EventName {
  return (EVENT_NAMES as readonly string[]).includes(value);
}

/**
 * DI token for the catalog. Exposed by EventBridgeModule so a consumer can
 * inject the catalog (e.g. to build a filter UI) without importing this file
 * across module boundaries; `Symbol` matches the convention in
 * `common/constants/app.constants.ts`.
 */
export const EVENT_CATALOG_TOKEN = Symbol('EVENT_CATALOG');
