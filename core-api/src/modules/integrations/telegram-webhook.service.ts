import { Injectable, Logger } from '@nestjs/common';
import { TelegramConnectService } from './telegram-connect.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
    entities?: Array<{
      offset: number;
      length: number;
      type: string;
    }>;
    date: number;
  };
}

@Injectable()
export class TelegramWebhookService {
  private readonly logger = new Logger(TelegramWebhookService.name);

  constructor(
    private readonly telegramConnectService: TelegramConnectService,
  ) {}

  /**
   * Processes a Telegram update sent to the webhook endpoint.
   * Handles /start <token> commands to pair a Telegram chat with a user.
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) return;

    // Parse /start <token> or /start
    const text = message.text.trim();
    if (!text.startsWith('/start')) return;

    const token = text.split(/\s+/)[1];
    if (!token) {
      this.logger.debug('Ignored /start without token');
      return;
    }

    const chatId = String(message.chat.id);

    try {
      await this.telegramConnectService.confirmConnection(token, {
        chatId,
        username: message.chat.username ?? message.from?.username,
        firstName: message.chat.first_name ?? message.from?.first_name,
        lastName: message.chat.last_name ?? message.from?.last_name,
      });

      this.logger.log(
        `Telegram chat ${chatId} connected via token`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(
        `Failed to connect Telegram chat ${chatId}: ${err.message}`,
      );
    }
  }
}
