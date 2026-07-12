import { Logger } from '@nestjs/common';
import type { ConnectorConfig } from './connector.abstract';
import { NotificationConnector } from './connector.abstract';

/**
 * Expected shape of the push config for Slack notifications.
 */
interface SlackPushConfig {
  /** Slack Incoming Webhook URL, e.g. https://hooks.slack.com/services/T00/B00/xxxx. */
  webhookUrl: string;
  /** Optional display name for the bot sending the alert. */
  username?: string;
  /** Message text — supports Slack markdown formatting. */
  text: string;
}

/**
 * Expected extra config on the Integration entity for Slack.
 */
interface SlackIntegrationConfig {
  /** Slack Incoming Webhook URL, e.g. https://hooks.slack.com/services/T00/B00/xxxx. */
  webhookUrl: string;
  /** Optional display name for the bot sending the alert. */
  username?: string;
  /** Optional severity toggles; used to filter which alerts reach Slack. */
  CRITICAL?: boolean;
  HIGH?: boolean;
  MEDIUM?: boolean;
  LOW?: boolean;
  INFO?: boolean;
}

/**
 * Connector for sending notifications via a Slack Incoming Webhook.
 *
 * Sends an HTTP POST request with Slack's standard webhook payload format.
 * The webhook URL is created via Slack's "Incoming Webhooks" app integration.
 *
 * @see https://api.slack.com/messaging/webhooks
 *
 * @example
 * ```ts
 * const slack = new SlackConnector();
 * await slack.push({
 *   webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxxxx',
 *   username: 'OpenASM Alert',
 *   text: ':warning: Vulnerability detected on `app.example.com`',
 * });
 * ```
 */
export class SlackConnector extends NotificationConnector {
  private readonly logger = new Logger(SlackConnector.name);

  /**
   * Send a notification to a Slack channel via Incoming Webhook.
   *
   * @param config - Merged config containing stored integration settings
   *                 (`webhookUrl`, `username`) and runtime push parameters (`text`).
   * @throws Error if the Slack webhook returns a non-2xx status.
   */
  async push(config: ConnectorConfig): Promise<void> {
    const { webhookUrl, username, text } =
      config as unknown as SlackPushConfig;

    if (!webhookUrl || !text) {
      throw new Error(
        'Slack push requires webhookUrl and text in config',
      );
    }

    this.logger.log(`Sending Slack notification to ${webhookUrl}`);

    const body: Record<string, unknown> = {
      text,
    };

    if (username) {
      body.username = username;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Slack API error (${webhookUrl}): ${response.status} — ${errorBody}`,
      );
      throw new Error(
        `Slack webhook returned ${response.status}: ${errorBody}`,
      );
    }

    this.logger.log('Slack notification sent successfully');
  }
}

// Export types for consumers
export type { SlackPushConfig, SlackIntegrationConfig };
