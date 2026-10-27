import { Logger } from '@nestjs/common';
import type { ConnectorConfig } from './connector.abstract';
import { NotificationConnector } from './connector.abstract';

/** Discord rejects `content` longer than this with HTTP 400. */
const DISCORD_CONTENT_LIMIT = 2000;

/**
 * Expected shape of the push config for Discord notifications.
 */
interface DiscordPushConfig {
  /** Discord channel webhook URL, e.g. https://discord.com/api/webhooks/{id}/{token}. */
  webhookUrl: string;
  /** Optional display name overriding the webhook's default name. */
  username?: string;
  /** Message text — supports Discord markdown formatting. */
  text: string;
}

/**
 * Connector for sending notifications via a Discord channel webhook.
 *
 * Discord expects `content` (not `text`), which is why the generic webhook
 * connector cannot target it.
 *
 * @see https://discord.com/developers/docs/resources/webhook#execute-webhook
 */
export class DiscordConnector extends NotificationConnector {
  private readonly logger = new Logger(DiscordConnector.name);

  /**
   * Send a notification to a Discord channel via webhook.
   *
   * @throws Error if the Discord webhook returns a non-2xx status.
   */
  async push(config: ConnectorConfig): Promise<void> {
    const { webhookUrl, username, text } =
      config as unknown as DiscordPushConfig;

    if (!webhookUrl || !text) {
      throw new Error('Discord push requires webhookUrl and text in config');
    }

    const content =
      text.length > DISCORD_CONTENT_LIMIT
        ? `${text.slice(0, DISCORD_CONTENT_LIMIT - 1)}…`
        : text;

    const body: Record<string, unknown> = {
      content,
      // Scanner output must never ping @everyone, roles or users.
      allowed_mentions: { parse: [] },
    };

    if (username) {
      body.username = username;
    }

    // The webhook URL embeds its token, so it is never logged.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Discord API error: ${response.status} — ${errorBody}`);
      throw new Error(
        `Discord webhook returned ${response.status}: ${errorBody}`,
      );
    }

    this.logger.log('Discord notification sent successfully');
  }
}

export type { DiscordPushConfig };
