import { EventBusGroup, IntegrationType } from '@/common/enums/enum';
import { runConnector } from '@/modules/integrations/connectors/connector.factory';
import { IntegrationsService } from '@/modules/integrations/integrations.service';
import { decryptSensitiveConfigFields } from '@/modules/integrations/validators/integration.validator';
import { RedisService } from '@/services/redis/redis.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { Injectable, Logger } from '@nestjs/common';
import type { EventSink } from '../../consuming/event-sink';
import { claimEventOnce } from '../../consuming/idempotency';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';
import {
  eventForIntegration,
  isPushable,
  isTicketable,
  shouldPush,
} from './integration-delivery';
import { draftMessage } from './messages/event-drafts';
import { formatForAppType, renderMessage } from './messages/render';
import { toOutboundEnvelope } from './outbound-envelope';

/**
 * Integration capabilities this lane pushes to.
 *
 * TICKETING (Jira, GitHub issues, …) and NOTIFICATION (Slack/Telegram/webhook)
 * are both "tell a human outside the app". CLOUD_PROVIDER and SOURCE_CODE are
 * deliberately absent: those connectors IMPORT data, they do not receive
 * events, and letting them see the stream would create a feedback loop back
 * into targets/assets.
 *
 * An integration with BOTH capabilities is delivered once per capability —
 * a chat message and a ticket are two different side effects.
 */
const PUSHABLE_CAPABILITIES: IntegrationType[] = [
  IntegrationType.TICKETING,
  IntegrationType.NOTIFICATION,
];

/**
 * Consumer group `integrations`: delivers domain events to the webhooks,
 * Slack channels and ticketing systems a workspace has connected.
 *
 * Per event: lane policy → claim once → for each connected integration:
 * integration policy → draft + render → connector.
 *
 * It is a SEPARATE group from `notifications` because outbound HTTP is slow
 * and unreliable in a way a database insert is not: sharing a group would let
 * one unresponsive endpoint stall in-app notifications.
 *
 * Idempotency: a Redis claim stops OUR redeliveries from pushing twice, and
 * the CloudEvents `id` travels as `eventId` so a receiver can dedupe the
 * duplicates generated OUTSIDE our process (proxy retry, at-least-once
 * gateway).
 */
@Injectable()
export class IntegrationsSink implements EventSink {
  readonly group = EventBusGroup.Integrations;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Integrations];

  private readonly logger = new Logger(IntegrationsSink.name);

  constructor(
    private readonly redis: RedisService,
    private readonly integrationsService: IntegrationsService,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
  ) {}

  accepts(name: EventName): boolean {
    return isPushable(name);
  }

  async handle(name: EventName, event: ConsumedEvent): Promise<void> {
    if (!shouldPush(name, event)) {
      return;
    }
    const first = await claimEventOnce(this.redis, this.group, event.eventId);
    if (!first) {
      return;
    }
    await this.push(name, event);
  }

  private async push(name: EventName, event: ConsumedEvent): Promise<void> {
    const deliveries = await this.findPushable(name, event.workspaceId);
    if (deliveries.length === 0) {
      return;
    }

    const dek = await this.workspaceEncryption.getDEK(event.workspaceId);

    const results = await Promise.allSettled(
      deliveries.map(async ({ integration, capability }) => {
        const config = decryptSensitiveConfigFields(integration.config, dek);

        // Policy: muted entirely, or narrowed to what this integration wants
        // (e.g. only the severities it subscribed to).
        const scoped = eventForIntegration(name, event, config);
        if (!scoped) {
          return;
        }

        // View: payload → draft → this channel's markup.
        const draft = draftMessage(name, scoped);
        const text = renderMessage(draft, formatForAppType(integration.appType));

        const result = await runConnector(
          integration.appType,
          capability,
          {
            ...config,
            ...toOutboundEnvelope(name, scoped),
            // Ticket title; chat connectors ignore it.
            title: draft.title,
            text,
            // Idempotency key for the receiver. Deliberately NOT a secret and
            // NOT redacted: the receiver needs it to dedupe.
            eventId: event.eventId,
            integrationId: integration.id,
          },
        );

        // `runConnector` reports failure as a value, not a throw — surface it
        // so the loop below logs it instead of counting it as delivered.
        if (!result.success) {
          throw new Error(
            `${integration.appType} (${integration.id}): ${result.error ?? result.message}`,
          );
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        // One broken endpoint must not stop the others: the lane is
        // best-effort by design, and throwing here would park a healthy
        // workspace's event in the DLQ because someone else's webhook 500s.
        this.logger.error(
          `Integration push failed for '${name}': ${String(result.reason)}`,
        );
      }
    }
  }

  /** One delivery per (integration, capability) that should see this event. */
  private async findPushable(name: EventName, workspaceId: string) {
    const capabilities = PUSHABLE_CAPABILITIES.filter(
      (capability) =>
        capability !== IntegrationType.TICKETING || isTicketable(name),
    );
    const byCapability = await Promise.all(
      capabilities.map(async (capability) => {
        const integrations =
          await this.integrationsService.getIntegrationEntitiesByCapability(
            workspaceId,
            capability,
          );
        return integrations.map((integration) => ({ integration, capability }));
      }),
    );
    return byCapability.flat();
  }
}
