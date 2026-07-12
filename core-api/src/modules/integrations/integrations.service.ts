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
import { Integration } from './entities/integration.entity';
import { universalIntegrationSchema } from './schemas';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
  ) {}

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

    const encryptedConfig = encryptSensitiveConfigFields(args.config);

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

    return this.toResponse(saved);
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

    const data = integrations.map((i) => this.toResponse(i));

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

    return this.toResponse(integration);
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
    const decryptedConfig = decryptSensitiveConfigFields(integration.config);

    // Merge stored config with a test message text
    const testConfig = {
      ...decryptedConfig,
      text:
        dto?.text ??
        `🧪 OpenASM test notification — sent at ${new Date().toISOString()}`,
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

    return integrations.map((i) => this.toResponse(i));
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
  private toResponse(integration: Integration): GetIntegrationDto {
    const decryptedConfig = decryptSensitiveConfigFields(integration.config);
    const maskedConfig = maskSensitiveConfigFields(decryptedConfig);

    return {
      id: integration.id,
      name: integration.name,
      description: integration.description,
      appType: integration.appType,
      category: integration.category,
      config: maskedConfig,
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
    const config = decryptSensitiveConfigFields(integration.config);

    const text = `🔗 OpenASM has been successfully connected! You'll receive security alerts and notifications here.`;

    const result = await runConnector(
      integration.appType,
      integration.category,
      {
        ...config,
        text,
      },
    );

    if (!result.success) {
      this.logger.warn(
        `Connected message failed for integration ${integration.id}: ${result.message}${result.error ? ` — ${result.error}` : ''}`,
      );
    }
  }
}
