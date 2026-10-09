import { AuditOutcome, EventBusGroup, IntegrationType } from '@/common/enums/enum';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { Injectable, Logger } from '@nestjs/common';
import { runConnector } from '../integrations/connectors/connector.factory';
import { IntegrationsService } from '../integrations/integrations.service';
import { decryptSensitiveConfigFields } from '../integrations/validators/integration.validator';
import type { EventName } from '../connectors/event';
import { SUBSCRIPTIONS, eventSeverity } from './event-policy';
import {
  StreamConsumerService,
  claimEventOnce,
  type ConsumedEvent,
} from './stream-consumer.service';

/**
 * Integration categories this group pushes to.
 *
 * TICKETING (Jira et al.) and NOTIFICATION (Slack/Telegram) are both
 * "tell a human outside the app". CLOUD_PROVIDER is deliberately absent: those
 * connectors IMPORT data (sync), they do not receive events, and letting them
 * see the stream would create a feedback loop back into targets/assets.
 */
const PUSHABLE_CATEGORIES: IntegrationType[] = [
  IntegrationType.TICKETING,
  IntegrationType.NOTIFICATION,
];

/**
 * Events that justify waking an external system.
 *
 * Deliberately a short list. A webhook is a side effect on someone else's
 * infrastructure — pushing every runtime event would turn a noisy domain into
 * someone else's outage, and an integration is opt-in per workspace, so the
 * cost lands on the customer who connected it. These are the ones an operator
 * connects a webhook FOR.
 */
const PUSHABLE_EVENTS = new Set<EventName>([
  'vulnerability.detected',
  'vulnerability.dismissed',
  'vulnerability.status.updated',
  'workflow.run.completed',
  'workflow.run.failed',
  'integration.sync.failed',
  'integration.ticket.created',
]);

/**
 * Consumer group `integrations`: delivers domain events to the webhooks,
 * Slack channels and ticketing systems a workspace has connected.
 *
 * It is a SEPARATE group from `notifications` for one reason: outbound HTTP is
 * slow and unreliable in a way a database insert is not. Sharing a group would
 * make one unresponsive endpoint stall the audit trail, or force a slow endpoint
 * to be retried on the same schedule as a fast one.
 *
 * Idempotency is carried as a header rather than a local marker: a receiver
 * that replays our request (proxy retry, at-least-once gateway) can dedupe on
 * it, which is the only mechanism that works when the duplicate is generated
 * OUTSIDE our process. The CloudEvents `id` is the value — it is unique per
 * published event and stable across redeliveries, which is exactly what a
 * receiver needs.
 */
@Injectable()
export class IntegrationsSinkService extends StreamConsumerService {
  private readonly pushLogger = new Logger(IntegrationsSinkService.name);

  constructor(
    redis: RedisService,
    lock: RedisLockService,
    private readonly integrationsService: IntegrationsService,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
  ) {
    super(redis, lock, {
      group: EventBusGroup.Integrations,
      domains: SUBSCRIPTIONS.integrations,
    });
  }

  protected async onEntry(
    name: EventName,
    event: ConsumedEvent,
  ): Promise<void> {
    if (!PUSHABLE_EVENTS.has(name)) {
      return;
    }
    if (
      event.outcome === AuditOutcome.Failure &&
      eventSeverity(name) !== 'critical'
    ) {
      // A failed non-critical action is an implementation detail; pushing it
      // would train integrators to ignore the stream.
      return;
    }

    const first = await claimEventOnce(
      this.redis,
      this.options.group,
      event.eventId,
    );
    if (!first) {
      return;
    }

    await this.push(name, event);
  }

  private async push(name: EventName, event: ConsumedEvent): Promise<void> {
    const integrations = await this.findPushable(event.workspaceId);
    if (integrations.length === 0) {
      return;
    }

    const dek = await this.workspaceEncryption.getDEK(event.workspaceId);
    const envelope = this.toOutboundEnvelope(name, event);

    const results = await Promise.allSettled(
      integrations.map(async (integration) => {
        const config = decryptSensitiveConfigFields(integration.config, dek);

        // A workspace can mute an individual event kind in its integration
        // config — an explicit `false` always wins.
        if (config[name] === false) {
          return;
        }

        await runConnector(integration.appType, integration.category, {
          ...config,
          ...envelope,
          // Idempotency key for the receiver. Deliberately NOT a secret and
          // NOT redacted: the receiver needs it to dedupe, so it must survive
          // redaction exactly as the CloudEvents id does.
          eventId: event.eventId,
          integrationId: integration.id,
        });
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        // One broken endpoint must not stop the others: the group is
        // best-effort by design, and throwing here would park a healthy
        // workspace's event in the DLQ because someone else's webhook 500s.
        this.pushLogger.error(
          `Integration push failed for '${name}': ${String(result.reason)}`,
        );
      }
    }
  }

  private async findPushable(workspaceId: string) {
    const byCategory = await Promise.all(
      PUSHABLE_CATEGORIES.map((category) =>
        this.integrationsService.getIntegrationEntitiesByCategory(
          workspaceId,
          category,
        ),
      ),
    );
    return byCategory.flat();
  }

  /**
   * The outbound body. A stable, documented shape rather than the internal
   * envelope: the envelope carries `requestId`/`actor`/audit fields that mean
   * nothing outside the app and would leak request correlation into customer
   * infrastructure.
   */
  private toOutboundEnvelope(name: EventName, event: ConsumedEvent) {
    return {
      type: name,
      workspaceId: event.workspaceId,
      occurredAt: event.occurredAt,
      outcome: event.outcome,
      actor: event.actor?.name,
      resourceType: event.resourceType ?? name.split('.')[0],
      resourceId: event.resourceId,
      changes: event.changes,
      metadata: event.metadata,
      payload: event.payload,
    };
  }
}