import { EventBusGroup } from '@/common/enums/enum';

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
 * to the sink (`EventSink.accepts`), not here: this table is the TRANSPORT's
 * routing, and keeping content decisions out of it is what stops it from
 * becoming a second, half-tested copy of the business rules.
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

export type DomainSubscription = (typeof SUBSCRIPTIONS)[EventBusGroup];
