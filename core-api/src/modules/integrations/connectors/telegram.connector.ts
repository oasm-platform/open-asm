import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { TelegramConnectStatus } from '@/common/enums/enum';
import type { TelegramConnect } from '@/modules/integrations/entities/telegram-connect.entity';
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
   * Integration ID used to query connected Telegram chats from
   * the telegram_connects table.
   */
  integrationId: string;
  /** Message text — supports parseMode formatting. */
  text: string;
  /** Optional parse mode: HTML (default), MarkdownV2, or Markdown. */
  parseMode?: ParseMode;
  /** Optional: disable link previews in the message. */
  disableWebPagePreview?: boolean;
}

/**
 * Connector for sending notifications via the Telegram Bot API.
 *
 * Queries the telegram_connects table for active, connected chats,
 * then sends the message to each one.
 *
 * @example
 * ```ts
 * const telegram = new TelegramConnector();
 * await telegram.push({
 *   botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
 *   integrationId: 'uuid-of-integration',
 *   text: '<b>Alert:</b> Vulnerability detected on <code>app.example.com</code>',
 * });
 * ```
 */
export class TelegramConnector extends NotificationConnector {
  private readonly logger = new Logger(TelegramConnector.name);

  /**
   * Static reference to the TelegramConnect repository.
   * Set once at module init via {@link setConnectRepo}.
   */
  static connectRepo: Repository<TelegramConnect> | null = null;

  /**
   * Initialise the static repository reference.
   * Called from TelegramConnectService.onModuleInit.
   */
  static setConnectRepo(repo: Repository<TelegramConnect>): void {
    TelegramConnector.connectRepo = repo;
  }

  /**
   * Send a notification to all connected Telegram chats for the given
   * integration. Looks up chat IDs from the telegram_connects table.
   *
   * @param config - Merged config containing botToken, integrationId, text, etc.
   * @throws Error if the Telegram API returns a non-OK response.
   */
  async push(config: ConnectorConfig): Promise<void> {
    const { botToken, integrationId, text, parseMode, disableWebPagePreview } =
      config as unknown as TelegramPushConfig;

    if (!botToken || !text) {
      throw new Error(
        'Telegram push requires botToken and text in config',
      );
    }
    if (!integrationId) {
      throw new Error(
        'Telegram push requires integrationId in config',
      );
    }
    if (!TelegramConnector.connectRepo) {
      throw new Error(
        'Telegram connector not initialised — call TelegramConnector.setConnectRepo(repo)',
      );
    }

    // Query active connected chats from telegram_connects table
    const connects = await TelegramConnector.connectRepo.find({
      where: {
        integrationId,
        status: TelegramConnectStatus.CONNECTED,
        isActive: true,
      },
      select: ['telegramChatId'],
    });

    const chatIds = connects
      .map((c) => c.telegramChatId)
      .filter((id): id is string => !!id);

    if (chatIds.length === 0) {
      this.logger.warn(
        `No connected Telegram chats for integration ${integrationId}, skipping push`,
      );
      return;
    }

    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

    for (const chatId of chatIds) {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: parseMode ?? 'HTML',
        disable_web_page_preview: disableWebPagePreview ?? true,
      };

      this.logger.log(`Sending Telegram message to chat ${chatId}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Telegram API error (${chatId}): ${response.status} — ${errorBody}`,
        );
        throw new Error(
          `Telegram API returned ${response.status} for chat ${chatId}: ${errorBody}`,
        );
      }

      const result = (await response.json()) as {
        ok: boolean;
        result?: unknown;
        description?: string;
      };

      if (!result.ok) {
        throw new Error(
          `Telegram API returned ok=false for chat ${chatId}: ${result.description ?? 'unknown error'}`,
        );
      }

      this.logger.log(`Telegram message sent to chat ${chatId}`);
    }
  }
}

// Export types for consumers
export type {
  TelegramPushConfig,
};
