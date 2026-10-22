import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ConnectorConfig } from './connector.abstract';
import { NotificationConnector } from './connector.abstract';

/**
 * Expected shape push config Webhook notifications.
 *
 * Everything except `url` and `headers` is the outbound event envelope the
 * integrations sink merges into the config (see `toOutboundEnvelope`).
 */
interface WebhookPushConfig {
  /** Target webhook endpoint URL. */
  url: string;
  /** Event name, e.g. `vulnerability.detected`. */
  type: string;
  /** Idempotency key; the receiver dedupes on it. */
  eventId?: string;
  /** Workspace ID the event belongs to. */
  workspaceId?: string;
  occurredAt?: string;
  outcome?: string;
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Event-specific structured data. */
  payload?: unknown;
  /**
   * Optional custom HTTP headers merged into request.
   * Useful auth tokens, content-type overrides, etc.
   */
  headers?: Record<string, string>;
}

/**
 * Expected extra config on the Integration entity for Webhook.
 */
interface WebhookIntegrationConfig {
  /** Target webhook endpoint URL. */
  url: string;
  /** Optional severity toggles; used to filter which alerts reach this webhook. */
  CRITICAL?: boolean;
  HIGH?: boolean;
  MEDIUM?: boolean;
  LOW?: boolean;
  INFO?: boolean;
}

/**
 * Connector for sending notifications via a custom webhook endpoint.
 *
 * Sends an HTTP POST request whose JSON body is the event itself — not the
 * rendered chat text — so the receiver can act on the structured payload.
 * The rendered `text` in the config is ignored.
 *
 * @example
 * ```ts
 * const webhook = new WebhookConnector();
 * await webhook.push({
 *   url: 'https://hooks.example.com/webhook',
 *   type: 'vulnerability.detected',
 *   eventId: '6f1c…',
 *   payload: { vulnerabilities: [...] },
 * });
 * ```
 */
export class WebhookConnector extends NotificationConnector {
  private readonly logger = new Logger(WebhookConnector.name);

  /**
   * Send an event to a custom webhook endpoint.
   *
   * @param config - Merged config containing stored integration settings
   *                 (`url`) and the outbound event envelope.
   * @throws Error if the webhook endpoint returns a non-2xx status.
   */
  async push(config: ConnectorConfig): Promise<void> {
    const {
      url,
      type,
      eventId,
      workspaceId,
      occurredAt,
      outcome,
      actor,
      resourceType,
      resourceId,
      changes,
      metadata,
      payload,
      headers,
    } = config as unknown as WebhookPushConfig;

    if (!url || !type) {
      throw new Error('Webhook push requires url and type in config');
    }

    this.logger.log(`Sending webhook event '${type}' to ${url}`);

    const sentAt = new Date().toISOString();
    // Fields are picked one by one: the config also holds the URL, toggles and
    // decrypted secrets, none of which may leave the process.
    const body = {
      id: eventId ?? randomUUID(),
      type,
      workspaceId,
      occurredAt: occurredAt ?? sentAt,
      outcome,
      actor,
      resourceType,
      resourceId,
      changes,
      metadata,
      payload,
      sentAt,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Webhook API error (${url}): ${response.status} — ${errorBody}`,
      );
      throw new Error(
        `Webhook returned ${response.status} for ${url}: ${errorBody}`,
      );
    }

    this.logger.log(`Webhook event '${type}' sent to ${url}`);
  }
}

// Export types for consumers
export type { WebhookPushConfig, WebhookIntegrationConfig };
