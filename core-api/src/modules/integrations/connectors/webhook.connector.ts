import { Logger } from '@nestjs/common';
import type { ConnectorConfig } from './connector.abstract';
import { NotificationConnector } from './connector.abstract';

/**
 * Expected shape of the push config for Webhook notifications.
 */
interface WebhookPushConfig {
  /** Target webhook endpoint URL. */
  url: string;
  /** Payload to send — sent as JSON body. */
  text: string;
  /**
   * Optional custom HTTP headers merged into the request.
   * Useful for auth tokens, content-type overrides, etc.
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
 * Sends an HTTP POST request with a JSON body containing the message payload.
 * Useful for integrating with arbitrary systems that accept incoming webhooks.
 *
 * @example
 * ```ts
 * const webhook = new WebhookConnector();
 * await webhook.push({
 *   url: 'https://hooks.example.com/webhook',
 *   text: 'Vulnerability detected on app.example.com',
 *   headers: { 'X-API-Key': 'secret' },
 * });
 * ```
 */
export class WebhookConnector extends NotificationConnector {
  private readonly logger = new Logger(WebhookConnector.name);

  /**
   * Send a notification to a custom webhook endpoint.
   *
   * @param config - Merged config containing stored integration settings
   *                 (`url`) and runtime push parameters (`text`, `headers`).
   * @throws Error if the webhook endpoint returns a non-2xx status.
   */
  async push(config: ConnectorConfig): Promise<void> {
    const { url, text, headers } = config as unknown as WebhookPushConfig;

    if (!url || !text) {
      throw new Error(
        'Webhook push requires url and text in config',
      );
    }

    this.logger.log(`Sending webhook notification to ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
      body: JSON.stringify({
        text,
        // Include a timestamp for the receiver to deduplicate if needed
        timestamp: new Date().toISOString(),
      }),
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

    this.logger.log(`Webhook notification sent to ${url}`);
  }
}

// Export types for consumers
export type { WebhookPushConfig, WebhookIntegrationConfig };
