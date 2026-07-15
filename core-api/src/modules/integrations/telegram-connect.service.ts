import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramConnectStatus } from '@/common/enums/enum';
import { generateToken } from '@/utils/genToken';
import { User } from '@/modules/auth/entities/user.entity';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { TelegramConnector } from './connectors/telegram.connector';
import { Integration } from './entities/integration.entity';
import { TelegramConnect } from './entities/telegram-connect.entity';
import { IntegrationsService } from './integrations.service';
import type { TelegramConnectDto } from './dto/telegram-connect.dto';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const CONNECT_TOKEN_LENGTH = 48;
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class TelegramConnectService implements OnModuleInit {
  private readonly logger = new Logger(TelegramConnectService.name);

  constructor(
    @InjectRepository(TelegramConnect)
    private readonly connectRepo: Repository<TelegramConnect>,
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly integrationsService: IntegrationsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Initialise the TelegramConnector with a reference to the connect repo
   * so it can query connected chats directly from push().
   */
  onModuleInit(): void {
    TelegramConnector.setConnectRepo(this.connectRepo);
  }

  /**
   * Creates (or reuses) a pairing token for the given user+integration.
   *
   * - If `force` is false (default) and a valid PENDING token exists → return it.
   * - If `force` is true or the existing token is expired → delete it and create a new one.
   */
  async createPairing(
    integrationId: string,
    workspaceId: string,
    userId: string,
    force = false,
  ): Promise<TelegramConnectDto> {
    const { integration, decryptedConfig } =
      await this.integrationsService.getIntegrationWithDecryptedConfig(
        integrationId,
        workspaceId,
      );
    if (integration.appType !== 'telegram') {
      throw new BadRequestException('Integration is not a Telegram bot');
    }

    const botToken = decryptedConfig.botToken as string | undefined;

    // Look for existing PENDING token for this user+integration
    const existing = await this.connectRepo.findOne({
      where: { integrationId, userId, status: TelegramConnectStatus.PENDING, isActive: true },
    });

    // Reuse if still valid and not forced to regenerate
    if (existing && !force) {
      if (existing.tokenExpiredAt && existing.tokenExpiredAt > new Date()) {
        const dto = this.toDto(existing);
        if (botToken) {
          dto.botUsername = await this.fetchBotUsername(botToken);
        }
        return dto;
      }
    }

    // Fetch bot username FIRST so any failure (invalid token, Telegram down)
    // stops here before any DB writes.
    let botUsername: string | undefined;
    if (botToken) {
      botUsername = await this.fetchBotUsername(botToken);
    }

    // Delete ALL existing PENDING records for this user+integration.
    // Prevents duplicate records from accumulating in edge cases
    // (race conditions, prior inconsistencies).
    await this.connectRepo.delete({
      integrationId, userId, status: TelegramConnectStatus.PENDING, isActive: true,
    });

    const token = generateToken(CONNECT_TOKEN_LENGTH);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    const entity = this.connectRepo.create({
      connectToken: token,
      tokenExpiredAt: expiresAt,
      status: TelegramConnectStatus.PENDING,
      integrationId,
      userId,
    });

    const saved = await this.connectRepo.save(entity);
    const dto = this.toDto(saved);

    dto.botUsername = botUsername;

    return dto;
  }

  /**
   * Fetches the bot username from Telegram via getMe.
   * Throws if the bot token is invalid or the API call fails.
   */
  private async fetchBotUsername(botToken: string): Promise<string> {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/getMe`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new InternalServerErrorException(
        `Telegram bot token is invalid or the bot does not exist (HTTP ${response.status})`,
      );
    }
    const data = (await response.json()) as { ok: boolean; result?: { username?: string } };
    if (!data.ok || !data.result?.username) {
      throw new InternalServerErrorException(
        'Telegram API returned an unexpected response for getMe',
      );
    }
    return data.result.username;
  }

  /**
   * Connects a Telegram chat to a connect token after the user sends /start <token>.
   */
  async confirmConnection(
    connectToken: string,
    chatInfo: {
      chatId: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<TelegramConnectDto> {
    const connect = await this.connectRepo.findOne({
      where: { connectToken, status: TelegramConnectStatus.PENDING, isActive: true },
    });

    // Resolve bot token for sending Telegram messages (best-effort)
    let botToken: string | undefined;
    if (connect) {
      try {
        const { decryptedConfig } =
          await this.integrationsService.getDecryptedIntegrationById(
            connect.integrationId,
          );
        botToken = decryptedConfig.botToken as string | undefined;
      } catch {
        // best-effort
      }
    }

    if (!connect) {
      // Try to notify the user even without a valid connect record
      if (botToken) {
        await this.sendTelegramMessage(
          botToken,
          chatInfo.chatId,
          '❌ *Connection Failed*\n\nThe pairing token is invalid or has expired. Please generate a new pairing code in OpenASM and try again.',
        );
      }
      throw new NotFoundException('Invalid or expired connect token');
    }

    // Check if this Telegram chat is already connected to this integration
    const existingConnect = await this.connectRepo.findOne({
      where: {
        integrationId: connect.integrationId,
        telegramChatId: chatInfo.chatId,
        status: TelegramConnectStatus.CONNECTED,
        isActive: true,
      },
    });

    if (existingConnect) {
      // Clean up the stale PENDING token — no longer needed
      await this.connectRepo.delete(connect.id);

      if (botToken) {
        await this.sendTelegramMessage(
          botToken,
          chatInfo.chatId,
          '🔁 <b>Already Connected</b>\n\nThis Telegram account is already linked to your workspace. You are already receiving notifications here.\n\nIf you want to reconnect, please disconnect first from the OpenASM dashboard.',
        );
      }
      throw new BadRequestException(
        'Telegram chat is already connected to this integration',
      );
    }

    if (connect.tokenExpiredAt && connect.tokenExpiredAt < new Date()) {
      if (botToken) {
        await this.sendTelegramMessage(
          botToken,
          chatInfo.chatId,
          '❌ *Connection Failed*\n\nThis pairing token has expired. Please generate a new pairing code in OpenASM and try again.',
        );
      }
      await this.connectRepo.delete(connect.id);
      throw new BadRequestException('Connect token has expired');
    }

    // Fetch workspace & user names for the welcome message
    let workspaceName = 'your workspace';
    let appUserName = 'User';
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: connect.integrationId },
        select: ['workspaceId'],
      });
      if (integration) {
        const workspace = await this.workspacesService.getWorkspaceConfigValue(
          integration.workspaceId,
        );
        workspaceName = workspace.name;
      }
    } catch {
      // best-effort
    }
    try {
      const user = await this.userRepo.findOne({
        where: { id: connect.userId },
        select: ['name'],
      });
      if (user) appUserName = user.name;
    } catch {
      // best-effort
    }

    connect.telegramChatId = chatInfo.chatId;
    connect.telegramUsername = chatInfo.username;
    connect.telegramFirstName = chatInfo.firstName;
    connect.telegramLastName = chatInfo.lastName;
    connect.status = TelegramConnectStatus.CONNECTED;

    const saved = await this.connectRepo.save(connect);

    // Send welcome message
    if (botToken) {
      const displayName =
        chatInfo.firstName ?? chatInfo.username ?? chatInfo.chatId;
      const escapedWs = this.escapeHtml(workspaceName);
      const escapedName = this.escapeHtml(displayName);
      const escapedUser = this.escapeHtml(appUserName);
      await this.sendTelegramMessage(
        botToken,
        chatInfo.chatId,
        `🎉 <b>Connected to ${escapedWs}!</b>

Hi ${escapedName}! You've successfully linked this chat to <b>${escapedWs}</b> as <b>${escapedUser}</b>.

You'll now receive security alerts and notifications here. Stay safe! 🔒`,
      );
    }

    return this.toDto(saved);
  }

  /**
   * Lists all telegram connects for a given integration.
   */
  async getConnects(
    integrationId: string,
    workspaceId: string,
    userId: string,
  ): Promise<TelegramConnectDto[]> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, workspaceId },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    const entities = await this.connectRepo.find({
      where: { integrationId, userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDto(e));
  }

  /**
   * Disconnects a specific Telegram connect.
   */
  async disconnect(
    connectId: string,
    integrationId: string,
    workspaceId: string,
  ): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId, workspaceId },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    // Fetch connect BEFORE deleting so we can send a final message
    const connect = await this.connectRepo.findOne({
      where: { id: connectId, integrationId },
      select: ['id', 'telegramChatId'],
    });
    if (!connect) {
      throw new NotFoundException('Telegram connect not found');
    }

    // Resolve workspace name for the goodbye message
    let workspaceName = 'OpenASM';
    try {
      const ws = await this.workspacesService.getWorkspaceConfigValue(
        integration.workspaceId,
      );
      workspaceName = ws.name;
    } catch {
      // best-effort
    }

    // Send goodbye message (best-effort)
    if (connect.telegramChatId) {
      let botToken: string | undefined;
      try {
        const { decryptedConfig } =
          await this.integrationsService.getDecryptedIntegrationById(
            integrationId,
          );
        botToken = decryptedConfig.botToken as string | undefined;
      } catch {
        // best-effort
      }
      if (botToken) {
        const escapedWs = this.escapeHtml(workspaceName);
        await this.sendTelegramMessage(
          botToken,
          connect.telegramChatId,
          `🔌 <b>Disconnected from ${escapedWs}</b>\n\nThis chat has been disconnected from <b>${escapedWs}</b>. You will no longer receive security alerts here.\n\nIf you'd like to reconnect, generate a new pairing code in OpenASM.`,
        );
      }
    }

    await this.connectRepo.delete(connect.id);
  }

  /**
   * Resolves connected Telegram chat IDs (chat_id) for a given integration.
   * Used by the notification processor to push messages to paired users.
   */
  async getConnectedChatIds(
    integrationId: string,
  ): Promise<string[]> {
    const connects = await this.connectRepo.find({
      where: { integrationId, status: TelegramConnectStatus.CONNECTED, isActive: true },
      select: ['telegramChatId'],
    });
    return connects
      .map((c) => c.telegramChatId)
      .filter((id): id is string => !!id);
  }

  /**
   * Sends an HTML-formatted message to a Telegram chat via the Bot API.
   */
  private async sendTelegramMessage(
    botToken: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!response.ok) {
        this.logger.warn(
          `Failed to send Telegram message to ${chatId}: HTTP ${response.status}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to send Telegram message to ${chatId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Escapes HTML special chars for safe inclusion in Telegram HTML messages.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private toDto(entity: TelegramConnect): TelegramConnectDto {
    return {
      id: entity.id,
      telegramChatId: entity.telegramChatId,
      telegramUsername: entity.telegramUsername,
      telegramFirstName: entity.telegramFirstName,
      telegramLastName: entity.telegramLastName,
      connectToken: entity.connectToken,
      tokenExpiredAt: entity.tokenExpiredAt,
      status: entity.status,
      isActive: entity.isActive,
      integrationId: entity.integrationId,
      userId: entity.userId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
