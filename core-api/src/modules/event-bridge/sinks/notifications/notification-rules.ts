import { NotificationScope, NotificationType } from '@/common/enums/enum';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { hasUnfinishedSteps, readPayload } from '../../contracts/event-payloads';
import { describeIncompleteSteps } from '../shared/run-steps';

/**
 * One event → the in-app notifications it implies.
 *
 * `SUBSCRIPTIONS` decides whether the transport hands an entry over at all;
 * these rules decide whether the event actually says something to a human.
 * Keeping them apart is what stops the subscription table from becoming a
 * second, half-tested copy of the notification rules.
 *
 * An event with no entry is explicitly NOT notified, and the list is small on
 * purpose: a scan that finds 400 assets should produce one "new assets" note,
 * not 400.
 */
export interface NotificationRule {
  type: NotificationType;
  scope: NotificationScope;
  /**
   * Where the recipients come from: the workspace's members, or the one user
   * the event names (undefined ⇒ nobody, the rule is skipped).
   */
  audience:
    | 'workspace-members'
    | { userId: (event: ConsumedEvent) => string | undefined };
  /** Whether this event warrants the notification at all. Default: yes. */
  when?: (event: ConsumedEvent) => boolean;
  /** Projects the event payload into the i18n message arguments. */
  metadata: (event: ConsumedEvent) => Record<string, string>;
}

/**
 * EVENT → NOTIFICATION. Only these events notify; everything else in the
 * subscribed domains is acknowledged without being decoded.
 */
export const NOTIFICATION_RULES: Partial<Record<EventName, NotificationRule[]>> =
  {
    // A scan finished and brought something back.
    'workflow.run.completed': [
      {
        type: NotificationType.ASSET_NEW_DETECT,
        scope: NotificationScope.GROUP,
        audience: 'workspace-members',
        metadata: (event) => {
          const p = readPayload('workflow.run.completed', event);
          return {
            hosts: String(p.hosts ?? 0),
            ports: String(p.ports ?? 0),
            services: String(p.services ?? 0),
            tech: String(p.techs ?? 0),
            targetValue: p.targetValue ?? '',
            targetId: p.targetId ?? '',
          };
        },
      },
      {
        // Only meaningful when the run did NOT complete its graph — a full run
        // already reported its new assets above, and "your scan stopped
        // halfway" after a clean finish is noise.
        type: NotificationType.SCAN_INCOMPLETE,
        scope: NotificationScope.GROUP,
        audience: 'workspace-members',
        when: (event) =>
          hasUnfinishedSteps(readPayload('workflow.run.completed', event)),
        metadata: (event) => {
          const p = readPayload('workflow.run.completed', event);
          return {
            targetValue: p.targetValue ?? '',
            targetId: p.targetId ?? '',
            details: describeIncompleteSteps(p),
          };
        },
      },
    ],
    // New vulnerabilities found during ingest.
    'vulnerability.detected': [
      {
        type: NotificationType.NEW_VULNERABILITY_FOUND,
        scope: NotificationScope.GROUP,
        audience: 'workspace-members',
        metadata: (event) => {
          const p = readPayload('vulnerability.detected', event);
          return {
            count: String(p.vulnerabilities?.length ?? 0),
            assetValue: p.assetValue ?? '',
            targetId: p.targetId ?? '',
            assetId: p.assetId ?? '',
          };
        },
      },
    ],
    // Addressed to the one user who requested the analysis — notifying the
    // whole workspace about one person's AI run would be wrong, not merely
    // noisy.
    'vulnerability.analysis.completed': [
      {
        type: NotificationType.VULNERABILITY_ANALYSIS_COMPLETED,
        scope: NotificationScope.USER,
        audience: {
          userId: (event) =>
            readPayload('vulnerability.analysis.completed', event).userId,
        },
        metadata: (event) => {
          const p = readPayload('vulnerability.analysis.completed', event);
          return {
            id: p.vulnerabilityId ?? '',
            name: p.vulnerabilityName ?? '',
          };
        },
      },
    ],
  };
