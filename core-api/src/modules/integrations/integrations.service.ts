import {
  decryptSensitiveConfigFields,
  encryptSensitiveConfigFields,
  maskSensitiveConfigFields,
  validateConfigOrThrow,
} from './validators/integration.validator';

import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IntegrationType } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { ConnectorTestResult } from './connectors/connector.factory';
import { runConnector } from './connectors/connector.factory';
import { GetIntegrationDto } from './dto/get-integration.dto';
import { GetManyIntegrationsDto } from './dto/get-many-integrations.dto';
import type { TestIntegrationDto } from './dto/test-integration.dto';
import type { UpdateIntegrationDto } from './dto/update-integration.dto';
import { Integration } from './entities/integration.entity';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import {
  notificationTypeProperties,
  severityProperties,
  universalIntegrationSchema,
} from './schemas';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
  ) {}

  /**
   * Auto-configures a Telegram bot webhook when running in production (BASE_URL set).
   * Called after create/update so each bot points to its unique webhook URL.
   */
  async autoConfigureTelegramWebhook(integration: Integration): Promise<void> {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) return; // polling mode — no webhook needed

    const dek = await this.workspaceEncryption.getDEK(integration.workspaceId);
    const config = decryptSensitiveConfigFields(integration.config, dek);
    const botToken = config.botToken as string | undefined;
    if (!botToken) return;

    const webhookUrl = `${baseUrl}/api/integrations/telegram/webhook/${integration.id}`;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl }),
        },
      );
      const data = (await res.json()) as { ok: boolean; description?: string };
      if (!data.ok) {
        this.logger.warn(
          `setWebhook failed for integration ${integration.id}: ${data.description}`,
        );
      } else {
        this.logger.log(
          `Telegram webhook configured for integration ${integration.id} → ${webhookUrl}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `setWebhook HTTP error for integration ${integration.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Returns the universal JSON Schema for console form rendering.
   * No workspace context needed — schema is global.
   */
  getSchemas(): Record<string, unknown> {
    return universalIntegrationSchema;
  }

  /**
   * Creates a new integration in the specified workspace.
   * Validates config against JSON Schema, encrypts sensitive fields, then persists.
   */
  async createIntegration(args: {
    name: string;
    description?: string;
    appType: string;
    category: string;
    config: Record<string, unknown>;
    workspaceId: string;
    userId: string;
  }): Promise<GetIntegrationDto> {
    validateConfigOrThrow(args);

    const dek = await this.workspaceEncryption.getDEK(args.workspaceId);
    const encryptedConfig = encryptSensitiveConfigFields(args.config, dek);

    const entity = this.integrationRepository.create({
      name: args.name,
      description: args.description,
      appType: args.appType,
      category: args.category,
      config: encryptedConfig,
      workspaceId: args.workspaceId,
      createdById: args.userId,
    });

    const saved = await this.integrationRepository.save(entity);

    // Fire welcome message for notification integrations (best-effort)
    if (args.category === (IntegrationType.NOTIFICATION as string)) {
      this.sendConnectedMessage(saved).catch((err: Error) => {
        this.logger.warn(
          `Failed to send connected message for integration ${saved.id}: ${err.message}`,
        );
      });
    }

    // Auto-configure Telegram webhook if BASE_URL is set
    if (saved.appType === 'telegram') {
      this.autoConfigureTelegramWebhook(saved).catch((err: Error) => {
        this.logger.warn(
          `Failed to configure Telegram webhook for ${saved.id}: ${err.message}`,
        );
      });
    }

    return this.toResponse(saved, dek);
  }

  /**
   * Fetches a paginated list of integrations for a workspace.
   * Supports search, filtering by appType/category, and standard pagination.
   */
  async getManyIntegrations(
    query: GetManyIntegrationsDto,
    workspaceId: string,
  ) {
    const { page, limit, sortBy, sortOrder, search, appType, category } = query;

    const qb = this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.workspaceId = :workspaceId', { workspaceId });

    if (search) {
      qb.andWhere(
        '(integration.name ILIKE :search OR integration.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (appType) {
      qb.andWhere('integration.appType = :appType', { appType });
    }

    if (category) {
      qb.andWhere('integration.category = :category', { category });
    }

    // Guard against invalid sort columns
    const allowedSortFields = [
      'createdAt',
      'updatedAt',
      'name',
      'appType',
      'category',
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`integration.${sortField}`, sortOrder);
    qb.skip((page - 1) * limit).take(limit);

    const [integrations, total] = await qb.getManyAndCount();

    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    const data = integrations.map((i) => this.toResponse(i, dek));

    return getManyResponse({ query, data, total });
  }

  /**
   * Fetches a single integration by ID within the workspace.
   * Throws NotFoundException if not found or not in this workspace.
   */
  async getIntegrationById(
    id: string,
    workspaceId: string,
  ): Promise<GetIntegrationDto> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    return this.toResponse(integration, dek);
  }

  /**
   * Returns a single Integration entity with decrypted config.
   * Throws NotFoundException if not found or not in this workspace.
   * Intended for internal service-to-service use where decrypted config is needed.
   */
  async getIntegrationWithDecryptedConfig(
    id: string,
    workspaceId: string,
  ): Promise<{ integration: Integration; decryptedConfig: Record<string, unknown> }> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });
    if (!integration) {
      throw new NotFoundException('Integration not found');
    }
    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    return {
      integration,
      decryptedConfig: decryptSensitiveConfigFields(integration.config, dek),
    };
  }

  /**
   * Returns a single Integration entity with decrypted config by id only.
   * Does NOT check workspace — for internal service-to-service use where
   * context has already been verified (e.g. confirming a connect token).
   */
  async getDecryptedIntegrationById(
    id: string,
  ): Promise<{ integration: Integration; decryptedConfig: Record<string, unknown> }> {
    const integration = await this.integrationRepository.findOne({
      where: { id },
    });
    if (!integration) {
      throw new NotFoundException('Integration not found');
    }
    const dek = await this.workspaceEncryption.getDEK(integration.workspaceId);
    return {
      integration,
      decryptedConfig: decryptSensitiveConfigFields(integration.config, dek),
    };
  }

  /**
   * Returns a single Integration entity with decrypted config.
   * Throws NotFoundException if not found or not in this workspace.
   * Intended for internal service-to-service use where decrypted config is needed.
   */
  async getIntegrationWithDecryptedConfig(
    id: string,
    workspaceId: string,
  ): Promise<{ integration: Integration; decryptedConfig: Record<string, unknown> }> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });
    if (!integration) {
      throw new NotFoundException('Integration not found');
    }
    return {
      integration,
      decryptedConfig: decryptSensitiveConfigFields(integration.config),
    };
  }

  /**
   * Returns a single Integration entity with decrypted config by id only.
   * Does NOT check workspace — for internal service-to-service use where
   * context has already been verified (e.g. confirming a connect token).
   */
  async getDecryptedIntegrationById(
    id: string,
  ): Promise<{ integration: Integration; decryptedConfig: Record<string, unknown> }> {
    const integration = await this.integrationRepository.findOne({
      where: { id },
    });
    if (!integration) {
      throw new NotFoundException('Integration not found');
    }
    return {
      integration,
      decryptedConfig: decryptSensitiveConfigFields(integration.config),
    };
  }

  /**
   * Tests an integration by executing its connector with the stored config.
   *
   * Decrypts sensitive config, injects a test payload, looks up the correct
   * connector class by appType, and dispatches the appropriate method by category.
   * No if/else chains — all dispatch is data-driven via the connector factory.
   */
  async testIntegration(
    id: string,
    workspaceId: string,
    dto?: TestIntegrationDto,
  ): Promise<ConnectorTestResult> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // Decrypt sensitive fields for the connector to use
    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    const decryptedConfig = decryptSensitiveConfigFields(integration.config, dek);

    // Merge stored config with a test message text
    const testConfig: Record<string, unknown> = {
      ...decryptedConfig,
      text:
        dto?.text ??
        `🧪 OpenASM test notification — sent at ${new Date().toISOString()}`,
      integrationId: integration.id,
    };

    return runConnector(integration.appType, integration.category, testConfig);
  }

  /**
   * Permanently removes an integration by ID within the workspace.
   * Throws NotFoundException if not found or not in this workspace.
   */
  async deleteIntegration(
    id: string,
    workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    await this.integrationRepository.remove(integration);

    return {
      message: `Integration "${id}" successfully deleted`,
    };
  }

  /**
   * Updates an existing integration's name, description, or config.
   * If config is provided, it is validated against JSON Schema and sensitive fields are re-encrypted.
   * Throws NotFoundException if not found or not in this workspace.
   */
  async updateIntegration(
    id: string,
    workspaceId: string,
    dto: UpdateIntegrationDto,
  ): Promise<GetIntegrationDto> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    if (dto.name !== undefined) {
      integration.name = dto.name;
    }

    if (dto.description !== undefined) {
      integration.description = dto.description;
    }

    const dek = await this.workspaceEncryption.getDEK(workspaceId);

    if (dto.config !== undefined) {
      validateConfigOrThrow({
        appType: integration.appType,
        category: integration.category,
        config: dto.config,
      });

      integration.config = encryptSensitiveConfigFields(dto.config, dek);
    }

    const saved = await this.integrationRepository.save(integration);

    // Re-configure Telegram webhook if config was updated (bot token might have changed)
    if (saved.appType === 'telegram' && dto.config !== undefined) {
      this.autoConfigureTelegramWebhook(saved).catch((err: Error) => {
        this.logger.warn(
          `Failed to reconfigure Telegram webhook for ${saved.id}: ${err.message}`,
        );
      });
    }

    return this.toResponse(saved, dek);
  }

  /**
   * Fetches all integrations for a workspace filtered by category.
   * Returns decrypted & masked integration DTOs.
   */
  async getIntegrationByWorkspaceId(
    workspaceId: string,
    category: string,
  ): Promise<GetIntegrationDto[]> {
    const integrations = await this.integrationRepository.find({
      where: { workspaceId, category },
    });

    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    return integrations.map((i) => this.toResponse(i, dek));
  }

  /**
   * Returns raw Integration entities for a workspace + category with decrypted config.
   * Intended for internal service-to-service use (e.g. notification processor).
   */
  async getIntegrationEntitiesByCategory(
    workspaceId: string,
    category: string,
  ): Promise<Integration[]> {
    return this.integrationRepository.find({
      where: { workspaceId, category },
    });
  }

  /**
   * Maps an Integration entity to a response DTO.
   * Decrypts then masks sensitive config fields.
   */
  private toResponse(integration: Integration, dek: Buffer | null): GetIntegrationDto {
    const decryptedConfig = decryptSensitiveConfigFields(integration.config, dek);
    const maskedConfig = maskSensitiveConfigFields(decryptedConfig);

    // For NOTIFICATION integrations, auto-enable any toggle keys missing from
    // the stored config. This ensures newly added notification type / severity
    // toggles work for existing integrations without requiring re-configuration.
    let config = maskedConfig;
    if (integration.category === (IntegrationType.NOTIFICATION as string)) {
      const toggleKeys = new Set([
        ...Object.keys(notificationTypeProperties),
        ...Object.keys(severityProperties),
      ]);
      config = { ...maskedConfig };
      for (const key of toggleKeys) {
        if (!(key in maskedConfig)) {
          config[key] = true;
        }
      }
    }

    return {
      id: integration.id,
      name: integration.name,
      description: integration.description,
      appType: integration.appType,
      category: integration.category,
      config,
      workspaceId: integration.workspaceId,
      createdById: integration.createdById,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  /**
   * Sends a welcome "connected" message to the integration after first setup.
   * Best-effort — failures are logged but never propagated.
   */
  private async sendConnectedMessage(integration: Integration): Promise<void> {
    const dek = await this.workspaceEncryption.getDEK(integration.workspaceId);
    const config = decryptSensitiveConfigFields(integration.config, dek);

    const text = `🔗 OpenASM has been successfully connected! You'll receive security alerts and notifications here.`;

    const result = await runConnector(
      integration.appType,
      integration.category,
      {
        ...config,
        text,
        integrationId: integration.id,
      },
    );

    if (!result.success) {
      this.logger.warn(
        `Connected message failed for integration ${integration.id}: ${result.message}${result.error ? ` — ${result.error}` : ''}`,
      );
    }
  }
}
