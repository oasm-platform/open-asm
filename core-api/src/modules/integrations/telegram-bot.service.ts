import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';

/**
 * Shared service for interacting with the Telegram Bot API.
 * Caches TelegramBot instances per token (send-only, no polling).
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  /** Cached bot instances keyed by token. */
  private readonly bots = new Map<string, TelegramBot>();

  private getBot(token: string): TelegramBot {
    let bot = this.bots.get(token);
    if (!bot) {
      bot = new TelegramBot(token);
      this.bots.set(token, bot);
    }
    return bot;
  }

  /**
   * Sends an HTML-formatted text message to a Telegram chat.
   */
  async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    try {
      await this.getBot(botToken).sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      this.logger.warn(
        `Failed send Telegram message ${chatId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Registers bot commands with Telegram so users see the command menu.
   */
  async setMyCommands(
    botToken: string,
    commands: Array<{ command: string; description: string }>,
  ): Promise<boolean> {
    try {
      return await this.getBot(botToken).setMyCommands(commands, {
        scope: { type: 'default' },
      });
    } catch (err) {
      this.logger.warn(
        `Failed sync bot commands: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Calls getMe to validate the bot token and return the bot username.
   * Throws if the token is invalid.
   */
  async getMe(botToken: string): Promise<{ username: string }> {
    const result = await this.getBot(botToken).getMe();
    if (!result.username) {
      throw new Error('Telegram getMe returned no username');
    }
    return { username: result.username };
  }
}
