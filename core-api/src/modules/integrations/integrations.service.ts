import {
  decryptSensitiveConfigFields,
  encryptSensitiveConfigFields,
  maskSensitiveConfigFields,
  omitDiscriminatorFields,
  restoreMaskedSecrets,
  validateConfigOrThrow,
} from './validators/integration.validator';

import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IntegrationType } from '@/common/enums/enum';
import type { WrapperType } from '@/common/types/app.types';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';

import {
  hasCapability,
  isMultiCapabilityApp,
  normalizeCapabilities,
  resolveCapabilities,
} from './capabilities';
import type { ConnectorTestResult } from './connectors/connector.factory';
import {
  resolveSourceCodeConnector,
  runConnector,
  testConnectorConnection,
} from './connectors/connector.factory';
import { GetIntegrationDto } from './dto/get-integration.dto';
import { GetManyIntegrationsDto } from './dto/get-many-integrations.dto';
import type {
  ListRepositoriesQueryDto,
  ListRepositoriesResponseDto,
  SourceOrganizationDto,
} from './dto/list-repositories.dto';
import type { TestIntegrationDto } from './dto/test-integration.dto';
import type { UpdateIntegrationDto } from './dto/update-integration.dto';
import { Integration } from './entities/integration.entity';
import { IntegrationSyncService } from './integrations-sync.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import {
  notificationTypeProperties,
  severityProperties,
  universalIntegrationSchema,
} from './schemas';

/**
 * Derives the Telegram webhook `secret_token` from the bot token.
 *
 * The webhook is a @Public() route, so Telegram's shared-secret header is the
 * only thing distinguishing a genuine update from anyone who guesses the
 * integration id. Deriving it (rather than storing it) keeps this fix free of a
 * schema change: both `setWebhook` and the inbound controller compute the same
 * value from the same bot token. Telegram accepts 1-256 chars from
 * [A-Za-z0-9_-], which a hex digest satisfies.
 */
export function deriveTelegramWebhookSecret(botToken: string): string {
  return createHmac('sha256', 'oasm.telegram.webhook')
    .update(botToken)
    .digest('hex');
}

/**
 * Constant-time comparison of the inbound Telegram secret header against the
 * expected value derived from the stored bot token.
 */
export function verifyTelegramWebhookSecret(
  provided: string | undefined,
  botToken: string,
): boolean {
  if (!provided) return false;
  const expected = Buffer.from(deriveTelegramWebhookSecret(botToken), 'utf8');
  const received = Buffer.from(provided, 'utf8');
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
    @Inject(forwardRef(() => IntegrationSyncService))
    private readonly integrationSyncService: WrapperType<IntegrationSyncService>,
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
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: deriveTelegramWebhookSecret(botToken),
          }),
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

  private assertAwsWorkloadIdentityScheduleAllowed(args: {
    appType: string;
    connectionMethod: unknown;
    syncSchedule?: string;
  }): void {
    if (
      args.appType === 'aws' &&
      args.connectionMethod === 'workloadIdentity' &&
      typeof args.syncSchedule === 'string' &&
      args.syncSchedule !== 'disabled'
    ) {
      throw new BadRequestException(
        'AWS workloadIdentity integrations do not support scheduled syncs; the OIDC token is short-lived. Set syncSchedule to "disabled" and run manual syncs.',
      );
    }
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
    capabilities?: string[];
    config: Record<string, unknown>;
    workspaceId: string;
    userId: string;
    syncSchedule?: string;
  }): Promise<GetIntegrationDto> {
    // Legacy apps resolve to [category] exactly as before; multi-capability
    // apps get their enabled subset plus a primary `category` inside it.
    const { category, capabilities } = normalizeCapabilities(args);
    const config = omitDiscriminatorFields(args.config);

    validateConfigOrThrow({
      appType: args.appType,
      category,
      capabilities,
      config,
    });

    // Periodic syncs only make sense for cloud providers: the scheduler
    // dispatches runConnector with CLOUD_PROVIDER, which notification/
    // ticketing connectors do not implement (F3).
    if (
      args.syncSchedule &&
      args.syncSchedule !== 'disabled' &&
      !capabilities.includes(IntegrationType.CLOUD_PROVIDER)
    ) {
      throw new BadRequestException(
        'syncSchedule is only supported for CLOUD_PROVIDER integrations',
      );
    }

    // AWS workloadIdentity relies on a short-lived OIDC token; a recurring
    // sync would fail once the token expires, so only manual/disabled sync
    // is allowed.
    this.assertAwsWorkloadIdentityScheduleAllowed({
      appType: args.appType,
      connectionMethod: config.connectionMethod,
      syncSchedule: args.syncSchedule,
    });

    const dek = await this.workspaceEncryption.getDEK(args.workspaceId);
    const encryptedConfig = encryptSensitiveConfigFields(config, dek);

    const entity = this.integrationRepository.create({
      name: args.name,
      description: args.description,
      appType: args.appType,
      category,
      capabilities,
      config: encryptedConfig,
      workspaceId: args.workspaceId,
      createdById: args.userId,
    });

    const saved = await this.integrationRepository.save(entity);

    // Wire the periodic sync scheduler (SC-SCHED-1); 'disabled'/undefined
    // keeps the entity default and creates no BullMQ job. If scheduling
    // fails, the just-created row is removed best-effort so no orphaned
    // integration survives without its scheduler, then the error propagates.
    if (args.syncSchedule && args.syncSchedule !== 'disabled') {
      try {
        await this.integrationSyncService.applySchedule(saved, args.syncSchedule);
      } catch (error) {
        try {
          await this.integrationRepository.remove(saved);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to remove integration ${saved.id} after schedule wiring failure: ${
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`,
          );
        }
        throw error;
      }
    }

    // Fire welcome message for notification integrations (best-effort)
    if (hasCapability(saved, IntegrationType.NOTIFICATION)) {
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
      // Matches the primary category OR any enabled capability, so filtering
      // by TICKETING also finds a GitHub row whose primary is SOURCE_CODE.
      qb.andWhere(
        '(integration.category = :category OR :category = ANY(integration.capabilities))',
        { category },
      );
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
   * Tests an integration by executing its connector with the stored config.
   *
   * Decrypts sensitive config, injects a test payload, looks up the correct
   * connector class by appType, and dispatches the appropriate method by
   * capability. No if/else chains — all dispatch is data-driven via the
   * connector factory.
   *
   * Tested capability: `dto.capability` when given (must be enabled);
   * otherwise the category for single-capability apps (unchanged behaviour)
   * and a plain connection check for multi-capability apps.
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

    if (dto?.capability && !hasCapability(integration, dto.capability)) {
      throw new BadRequestException(
        `Capability ${dto.capability} is not enabled on this integration`,
      );
    }
    const capability: string | undefined =
      dto?.capability ??
      (isMultiCapabilityApp(integration.appType)
        ? undefined
        : integration.category);

    // Cloud providers are tested with a dry-run sync: fetch + count only, no
    // DB writes and no lastRunAt update (SC-API-3). A failed dry run is a
    // normal test outcome (e.g. bad token) — reported as success:false
    // instead of surfacing as an unhandled 400 (SC-TEST-2b).
    if (capability === (IntegrationType.CLOUD_PROVIDER as string)) {
      try {
        const sync = await this.integrationSyncService.runSync(id, workspaceId, {
          dryRun: true,
        });
        return {
          success: true,
          category: integration.category,
          appType: integration.appType,
          message: `${integration.appType} sync OK (dry run): ${JSON.stringify(sync)}`,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          return {
            success: false,
            category: integration.category,
            appType: integration.appType,
            message: 'Connector test failed',
            timestamp: new Date().toISOString(),
            error: error.message,
          };
        }
        throw error;
      }
    }

    // Decrypt sensitive fields for the connector to use
    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    const decryptedConfig = decryptSensitiveConfigFields(integration.config, dek);

    // Only NOTIFICATION has a harmless "send something" action. Ticketing
    // would open a real ticket and source-code has no action at all, so they
    // (and the bare connection) are checked via testConnection() instead.
    if (capability !== (IntegrationType.NOTIFICATION as string)) {
      return testConnectorConnection(
        integration.appType,
        capability,
        decryptedConfig,
      );
    }

    // Merge stored config with a test message text
    const testConfig: Record<string, unknown> = {
      ...decryptedConfig,
      text:
        dto?.text ??
        `🧪 OpenASM test notification — sent at ${new Date().toISOString()}`,
      integrationId: integration.id,
    };

    return runConnector(
      integration.appType,
      IntegrationType.NOTIFICATION,
      testConfig,
    );
  }

  /**
   * Lists the namespaces (GitHub orgs/user, GitLab groups/user) a SOURCE_CODE
   * integration can read — the choices for a new GIT_ORG target.
   */
  async listOrganizations(
    id: string,
    workspaceId: string,
  ): Promise<SourceOrganizationDto[]> {
    const { integration, decryptedConfig } =
      await this.getIntegrationWithDecryptedConfig(id, workspaceId);

    if (!hasCapability(integration, IntegrationType.SOURCE_CODE)) {
      throw new BadRequestException(
        'Organizations can only be listed for integrations with the SOURCE_CODE capability',
      );
    }

    const connector = resolveSourceCodeConnector(integration.appType);
    try {
      return await connector.listOrganizations(decryptedConfig);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to list organizations',
      );
    }
  }

  /**
   * Lists the repositories visible to a SOURCE_CODE integration, straight
   * from the provider (nothing is cached or persisted). The console uses it
   * to let a user pick repositories to link.
   */
  async listRepositories(
    id: string,
    workspaceId: string,
    query: ListRepositoriesQueryDto,
  ): Promise<ListRepositoriesResponseDto> {
    const { integration, decryptedConfig } =
      await this.getIntegrationWithDecryptedConfig(id, workspaceId);

    if (!hasCapability(integration, IntegrationType.SOURCE_CODE)) {
      throw new BadRequestException(
        'Repositories can only be listed for integrations with the SOURCE_CODE capability',
      );
    }

    const connector = resolveSourceCodeConnector(integration.appType);
    try {
      return await connector.listRepositories(decryptedConfig, {
        search: query.search,
        page: query.page,
        limit: query.limit,
      });
    } catch (error) {
      // Provider failures (bad token, missing scope) are the user's to fix —
      // a 400 with the provider message, not an opaque 500.
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to list repositories',
      );
    }
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

    // Remove the periodic sync scheduler before deleting the row
    // (SC-SCHED-5).
    await this.integrationSyncService.removeJobScheduler(integration.id);

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

    let capabilitiesChanged = false;
    if (dto.capabilities !== undefined) {
      const previous = resolveCapabilities(integration);
      const normalized = normalizeCapabilities({
        appType: integration.appType,
        category: integration.category,
        capabilities: dto.capabilities,
      });
      capabilitiesChanged =
        previous.length !== normalized.capabilities.length ||
        normalized.capabilities.some((cap) => !previous.includes(cap));
      integration.category = normalized.category;
      integration.capabilities = normalized.capabilities;
    }

    // A capability change alone can make the stored config invalid (enabling
    // TICKETING requires ticketRepository), so re-validate whenever either
    // changes — against the new config, or the stored one.
    if (dto.config !== undefined || capabilitiesChanged) {
      const storedConfig = decryptSensitiveConfigFields(integration.config, dek);
      const config =
        dto.config !== undefined
          ? restoreMaskedSecrets(omitDiscriminatorFields(dto.config), storedConfig)
          : storedConfig;

      validateConfigOrThrow({
        appType: integration.appType,
        category: integration.category,
        capabilities: resolveCapabilities(integration),
        config,
      });

      if (dto.config !== undefined) {
        integration.config = encryptSensitiveConfigFields(config, dek);
      }
    }

    // Reject an effective AWS workloadIdentity + schedule combination even
    // when syncSchedule is omitted: a config-only update that switches an
    // already-scheduled integration to workloadIdentity would otherwise leave
    // the cron active for a connection method that cannot renew its token.
    const effectiveConnectionMethod =
      dto.config?.connectionMethod ??
      decryptSensitiveConfigFields(integration.config, dek).connectionMethod;
    const effectiveSyncSchedule =
      dto.syncSchedule ?? integration.syncSchedule;

    this.assertAwsWorkloadIdentityScheduleAllowed({
      appType: integration.appType,
      connectionMethod: effectiveConnectionMethod,
      syncSchedule: effectiveSyncSchedule,
    });

    // Re-register the periodic sync scheduler when the schedule changed
    // (SC-SCHED-3/4). Only cloud providers support schedules (F3).
    if (dto.syncSchedule !== undefined) {
      if (
        dto.syncSchedule !== 'disabled' &&
        !hasCapability(integration, IntegrationType.CLOUD_PROVIDER)
      ) {
        throw new BadRequestException(
          'syncSchedule is only supported for CLOUD_PROVIDER integrations',
        );
      }

      await this.integrationSyncService.applySchedule(
        integration,
        dto.syncSchedule,
      );
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
   * Fetches all integrations for a workspace that have `capability` enabled.
   * Returns decrypted & masked integration DTOs.
   */
  async getIntegrationByWorkspaceId(
    workspaceId: string,
    capability: string,
  ): Promise<GetIntegrationDto[]> {
    const integrations = await this.getIntegrationEntitiesByCapability(
      workspaceId,
      capability,
    );

    const dek = await this.workspaceEncryption.getDEK(workspaceId);
    return integrations.map((i) => this.toResponse(i, dek));
  }

  /**
   * Returns raw Integration entities for a workspace that have `capability`
   * enabled (config still encrypted). Intended for internal
   * service-to-service use (e.g. the integrations event lane).
   *
   * Matches `category` too: a legacy row's capability IS its category, so a
   * row whose `capabilities` array was never filled still matches.
   */
  async getIntegrationEntitiesByCapability(
    workspaceId: string,
    capability: string,
  ): Promise<Integration[]> {
    return this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        '(integration.category = :capability OR :capability = ANY(integration.capabilities))',
        { capability },
      )
      .getMany();
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
    if (hasCapability(integration, IntegrationType.NOTIFICATION)) {
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
      capabilities: resolveCapabilities(integration),
      config,
      workspaceId: integration.workspaceId,
      createdById: integration.createdById,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      syncSchedule: integration.syncSchedule,
      lastRunAt: integration.lastRunAt,
    };
  }

  /**
   * Enqueues an immediate asset sync for a cloud-provider integration
   * (POST /:id/sync). Verifies workspace ownership first (404 when missing or
   * foreign) and rejects non-cloud integrations (schedules only make sense
   * for CLOUD_PROVIDER), then enqueues the job and returns its jobId — the
   * sync itself runs asynchronously in IntegrationSyncProcessor.
   */
  async syncIntegration(
    id: string,
    workspaceId: string,
  ): Promise<{ jobId: string }> {
    const integration = await this.getIntegrationById(id, workspaceId);
    if (!hasCapability(integration, IntegrationType.CLOUD_PROVIDER)) {
      throw new BadRequestException(
        'syncSchedule is only supported for CLOUD_PROVIDER integrations',
      );
    }
    return this.integrationSyncService.enqueueManualSync(id, workspaceId);
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
      IntegrationType.NOTIFICATION,
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
