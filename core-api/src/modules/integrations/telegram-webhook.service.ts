import { Injectable, Logger } from '@nestjs/common';
import { TelegramConnectService } from './telegram-connect.service';
import { TelegramBotService } from './telegram-bot.service';

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

interface CommandContext {
  chatId: string;
  botToken?: string;
  integrationId?: string;
  firstName?: string;
}

interface BotCommand {
  command: string;
  description: string;
  fn: (args: string, ctx: CommandContext) => Promise<void>;
}

@Injectable()
export class TelegramWebhookService {
  private readonly logger = new Logger(TelegramWebhookService.name);

  /** Tracks botTokens whose commands have already been synced to Telegram. */
  private readonly syncedBots = new Set<string>();

  private readonly commands: BotCommand[] = [
    {
      command: 'pair',
      description: 'Connect this chat to OpenASM',
      fn: (args, ctx) => this.handlePair(args, ctx),
    },
    {
      command: 'unpair',
      description: 'Disconnect this chat from OpenASM',
      fn: (_args, ctx) => this.handleUnpair(ctx),
    },
    {
      command: 'help',
      description: 'Show available commands',
      fn: (_args, ctx) => this.handleHelp(ctx),
    },
  ];

  constructor(
    private readonly telegramConnectService: TelegramConnectService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  /**
   * Processes a Telegram update sent to the webhook endpoint.
   * Dispatches to registered commands. /start is an alias for /pair
   * (Telegram deep link t.me/bot?start=TOKEN requires /start).
   */
  async processUpdate(
    update: TelegramUpdate,
    options?: { botToken?: string; integrationId?: string },
  ): Promise<void> {
    const message = update.message;
    if (!message?.text) return;

    // Lazy sync: register commands with Telegram on first update per bot
    if (options?.botToken && !this.syncedBots.has(options.botToken)) {
      const synced = await this.telegramBotService.setMyCommands(
        options.botToken,
        this.commands.map((c) => ({
          command: c.command,
          description: c.description,
        })),
      );
      if (synced) {
        this.syncedBots.add(options.botToken);
      }
    }

    const text = message.text.trim();
    const chatId = String(message.chat.id);

    // Parse command: /command or /command@botname args
    const match = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)/s);
    if (!match) return;

    const [, cmdName, rawArgs] = match;
    const args = rawArgs.trim();
    const ctx: CommandContext = {
      chatId,
      botToken: options?.botToken,
      integrationId: options?.integrationId,
      firstName: message.from?.first_name,
    };

    // /start is an alias for /pair (Telegram deep link compatibility)
    if (cmdName === 'start') {
      await this.handlePair(args, ctx);
      return;
    }

    const command = this.commands.find((c) => c.command === cmdName);
    if (command) {
      await command.fn(args, ctx);
    }
  }

  private async handlePair(args: string, ctx: CommandContext): Promise<void> {
    if (!args) {
      const firstName = ctx.firstName ?? 'there';
      const instruction =
        `👋 Hi ${firstName}!\n\n` +
        `To connect your Telegram chat to OpenASM, you need to send a pairing token.\n\n` +
        `📋 <b>How to connect:</b>\n` +
        `1. Open OpenASM Console → Integrations → Telegram\n` +
        `2. Click <b>"Pair"</b> to generate a pairing token\n` +
        `3. Send the token here:\n` +
        `   <code>/pair &lt;your-token&gt;</code>\n\n` +
        `❓ If you need help, type /help`;

      if (ctx.botToken) {
        await this.telegramBotService.sendMessage(
          ctx.botToken,
          ctx.chatId,
          instruction,
        );
      }
      return;
    }

    try {
      await this.telegramConnectService.confirmConnection(args, {
        chatId: ctx.chatId,
        username: undefined,
        firstName: ctx.firstName,
      });
      this.logger.log(`Telegram chat ${ctx.chatId} connected via pair command`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(
        `Failed to connect Telegram chat ${ctx.chatId}: ${err.message}`,
      );
    }
  }

  private async handleUnpair(ctx: CommandContext): Promise<void> {
    if (!ctx.integrationId || !ctx.botToken) {
      this.logger.debug(
        'Cannot process /unpair: missing integrationId or botToken',
      );
      return;
    }

    const removed = await this.telegramConnectService.disconnectByChatId(
      ctx.chatId,
      ctx.integrationId,
    );

    if (removed) {
      await this.telegramBotService.sendMessage(
        ctx.botToken,
        ctx.chatId,
        '🔌 <b>Disconnected</b>\n\nThis chat has been disconnected from OpenASM. You will no longer receive security alerts here.\n\nIf you\'d like to reconnect, generate a new pairing code in OpenASM.',
      );
      this.logger.log(
        `Telegram chat ${ctx.chatId} disconnected via /unpair`,
      );
    } else {
      await this.telegramBotService.sendMessage(
        ctx.botToken,
        ctx.chatId,
        'ℹ️ <b>Not Connected</b>\n\nThis chat is not currently connected to any OpenASM workspace.\n\nTo connect, send /pair with your pairing token.',
      );
    }
  }

  private async handleHelp(ctx: CommandContext): Promise<void> {
    if (!ctx.botToken) return;

    const commandList = this.commands
      .map((c) => `  /${c.command} — ${c.description}`)
      .join('\n');

    const helpText =
      `📖 <b>Available Commands</b>\n\n` +
      `${commandList}\n\n` +
      `💡 <b>Note:</b> You can also use <code>/start &lt;token&gt;</code> (same as /pair) — this is required when connecting via link.`;

    await this.telegramBotService.sendMessage(
      ctx.botToken,
      ctx.chatId,
      helpText,
    );
  }
}
