import { Logger } from '@nestjs/common';
import type { ConnectorConfig } from './connector.abstract';
import { NotificationConnector } from './connector.abstract';

/**
 * Telegram Bot API base URL.
 * @see https://core.telegram.org/bots/api#making-requests
 */
const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Supported message parse modes for Telegram sendMessage.
 */
type ParseMode = 'HTML' | 'MarkdownV2' | 'Markdown';

/**
 * Expected shape of the push config for Telegram notifications.
 */
interface TelegramPushConfig {
  /** Bot token from BotFather (stored in integration config). */
  botToken: string;
  /**
   * Single destination chat / group / channel ID.
   * Ignored when `chats` (the stored config array) is provided.
   */
  chatId?: string;
  /**
   * Stored config chat destinations as "chatId" or "chatId|topicId" strings.
   * When provided, the message is sent to ALL configured destinations.
   * Falls back to `chatId` if empty.
   */
  chats?: string[];
  /** Message text — supports parseMode formatting. */
  text: string;
  /** Optional parse mode: HTML (default), MarkdownV2, or Markdown. */
  parseMode?: ParseMode;
  /** Optional: disable link previews in the message. */
  disableWebPagePreview?: boolean;
}

/**
 * A parsed single chat destination with optional topic/thread ID.
 */
interface TelegramChatDestination {
  /** Telegram chat, group, or channel ID. */
  chatId: string;
  /** Optional message thread ID for forum topics in supergroups. */
  topicId?: number;
}

/**
 * Expected extra config on the Integration entity for Telegram.
 */
interface TelegramIntegrationConfig {
  botToken: string;
  /** List of "chatId" or "chatId|topicId" strings. */
  chats: string[];
  /** Optional severity toggles; used to filter which alerts reach Telegram. */
  CRITICAL?: boolean;
  HIGH?: boolean;
  MEDIUM?: boolean;
  LOW?: boolean;
  INFO?: boolean;
}

/**
 * Parse a "chatId" or "chatId|topicId" string into a TelegramChatDestination.
 */
function parseChatDestination(raw: string): TelegramChatDestination {
  const index = raw.lastIndexOf('|');
  // If the pipe is followed by digits, treat it as topicId.
  // Otherwise the whole string is chatId.
  if (index > 0) {
    const potentialTopic = raw.slice(index + 1);
    if (/^\d+$/.test(potentialTopic)) {
      return { chatId: raw.slice(0, index), topicId: Number(potentialTopic) };
    }
  }
  return { chatId: raw };
}

/**
 * Connector for sending notifications via the Telegram Bot API.
 *
 * Expects the integration entity's config to contain at minimum a `botToken`
 * and a `chats` array of "chatId" or "chatId|topicId" strings.
 *
 * @example
 * ```ts
 * const telegram = new TelegramConnector();
 * await telegram.push({
 *   botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
 *   chats: ['-1001234567890', '-1009876543210|42'],
 *   text: '<b>Alert:</b> Vulnerability detected on <code>app.example.com</code>',
 * });
 * ```
 */
export class TelegramConnector extends NotificationConnector {
  private readonly logger = new Logger(TelegramConnector.name);

  /**
   * Send a notification to Telegram chat(s).
   *
   * Iterates over all configured `chats` destinations (or falls back to a
   * single `chatId`) and sends the message to each.
   *
   * @param config - Merged config containing stored integration settings
   *                 (`botToken`, `chats`) and runtime push parameters (`text`).
   * @throws Error if the Telegram API returns a non-OK response.
   */
  async push(config: ConnectorConfig): Promise<void> {
    const { botToken, chatId, chats, text, parseMode, disableWebPagePreview } =
      config as unknown as TelegramPushConfig;

    if (!botToken || !text) {
      throw new Error(
        'Telegram push requires botToken and text in config',
      );
    }

    // Determine destinations: prefer `chats` array from stored config,
    // fall back to a single `chatId` for backward compatibility.
    const destinations: TelegramChatDestination[] = [];
    if (chats && chats.length > 0) {
      for (const raw of chats) {
        destinations.push(parseChatDestination(raw));
      }
    } else if (chatId) {
      destinations.push(parseChatDestination(chatId));
    }

    if (destinations.length === 0) {
      throw new Error(
        'Telegram push requires at least one chat destination (chats or chatId)',
      );
    }

    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

    for (const dest of destinations) {
      const body: Record<string, unknown> = {
        chat_id: dest.chatId,
        text,
        parse_mode: parseMode ?? 'HTML',
        disable_web_page_preview: disableWebPagePreview ?? true,
      };

      // Optional message_thread_id for forum topics
      if (dest.topicId !== undefined) {
        body.message_thread_id = dest.topicId;
      }

      this.logger.log(
        `Sending Telegram message to chat ${dest.chatId}${dest.topicId !== undefined ? ` (topic ${dest.topicId})` : ''}`,
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Telegram API error (${dest.chatId}): ${response.status} — ${errorBody}`,
        );
        throw new Error(
          `Telegram API returned ${response.status} for chat ${dest.chatId}: ${errorBody}`,
        );
      }

      const result = (await response.json()) as {
        ok: boolean;
        result?: unknown;
        description?: string;
      };

      if (!result.ok) {
        throw new Error(
          `Telegram API returned ok=false for chat ${dest.chatId}: ${result.description ?? 'unknown error'}`,
        );
      }

      this.logger.log(`Telegram message sent to chat ${dest.chatId}`);
    }
  }
}

// Export types for consumers
export type {
  TelegramPushConfig,
  TelegramIntegrationConfig,
  TelegramChatDestination,
};
