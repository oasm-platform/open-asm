import { EventBusGroup } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { Inject, Injectable } from '@nestjs/common';
import type { EventSink } from '../../consuming/event-sink';
import { markEventHandled, wasEventHandled } from '../../consuming/idempotency';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { readPayload } from '../../contracts/event-payloads';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';

/** A finding event the issues lane acts on, read from its payload. */
export type IssueVulnerabilityFact =
  | {
      event: 'vulnerability.detected' | 'vulnerability.resurfaced';
      workspaceId: string;
      vulnerabilityIds: string[];
      /** The job that found them. */
      jobId?: string;
    }
  | {
      event: 'vulnerability.fixed';
      workspaceId: string;
      vulnerabilityIds: string[];
      /** The run that verified the fix. */
      jobHistoryId?: string;
    };

/** What the issues lane hands finding events to. */
export interface IssueVulnerabilityEvents {
  /** Runs the issue rules and the issue-type automation for the fact. */
  onVulnerabilityEvent(fact: IssueVulnerabilityFact): Promise<void>;
}

/**
 * DI token for {@link IssueVulnerabilityEvents}, provided by `IssuesModule`.
 * A token rather than the class so loading the bridge does not load the issue
 * services at import time.
 */
export const ISSUE_VULNERABILITY_EVENTS = Symbol('ISSUE_VULNERABILITY_EVENTS');

const HANDLED: ReadonlySet<string> = new Set([
  'vulnerability.detected',
  'vulnerability.resurfaced',
  'vulnerability.fixed',
]);

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

/**
 * Consumer group `issues`: issue rules and issue-type automation.
 *
 * - `vulnerability.detected` / `vulnerability.resurfaced`: the workspace's
 *   issue rules open or extend issues for the findings; a resurfaced finding
 *   also reopens the remediation issues it was resolved under.
 * - `vulnerability.fixed`: remediation issues whose findings are now all
 *   finished resolve themselves.
 *
 * The work is idempotent per state (a finding linked to an open issue is not
 * linked again; transitions are conditional on the status read), and the
 * event id is marked after the work so a redelivery is a no-op. Not
 * exclusive: the open-groupKey unique index settles races between replicas.
 */
@Injectable()
export class IssuesSink implements EventSink {
  readonly group = EventBusGroup.Issues;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Issues];

  constructor(
    @Inject(ISSUE_VULNERABILITY_EVENTS)
    private readonly issues: IssueVulnerabilityEvents,
    private readonly redis: RedisService,
  ) {}

  accepts(name: EventName): boolean {
    return HANDLED.has(name);
  }

  async handle(name: EventName, event: ConsumedEvent): Promise<void> {
    const fact = issueFactOf(name, event);
    if (!fact) return;
    if (await wasEventHandled(this.redis, this.group, event.eventId)) return;
    await this.issues.onVulnerabilityEvent(fact);
    await markEventHandled(this.redis, this.group, event.eventId);
  }
}

/** The fact an event carries, or null when its payload names no finding. */
export function issueFactOf(
  name: EventName,
  event: ConsumedEvent,
): IssueVulnerabilityFact | null {
  const { workspaceId } = event;
  if (!isString(workspaceId)) return null;
  switch (name) {
    case 'vulnerability.detected':
    case 'vulnerability.resurfaced': {
      const p = readPayload(name, event);
      const vulnerabilityIds = [
        ...new Set(
          (Array.isArray(p.vulnerabilities) ? p.vulnerabilities : [])
            .map((v) => v?.id)
            .filter(isString),
        ),
      ];
      if (vulnerabilityIds.length === 0) return null;
      return {
        event: name,
        workspaceId,
        vulnerabilityIds,
        ...(isString(p.jobId) ? { jobId: p.jobId } : {}),
      };
    }
    case 'vulnerability.fixed': {
      const p = readPayload('vulnerability.fixed', event);
      const vulnerabilityIds = [
        ...new Set(
          (Array.isArray(p.vulnerabilityIds) ? p.vulnerabilityIds : []).filter(
            isString,
          ),
        ),
      ];
      if (vulnerabilityIds.length === 0) return null;
      return {
        event: name,
        workspaceId,
        vulnerabilityIds,
        ...(isString(p.jobHistoryId) ? { jobHistoryId: p.jobHistoryId } : {}),
      };
    }
    default:
      return null;
  }
}
