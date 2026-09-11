import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IntegrationType } from '@/common/enums/enum';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { AuditLog } from '../audit/audit-log.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import {
  AwsSsoCompleteDto,
  AwsSsoDeviceDto,
  AwsSsoPollDto,
} from './dto/aws-sso.dto';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { GetIntegrationDto } from './dto/get-integration.dto';
import { GetManyIntegrationsDto } from './dto/get-many-integrations.dto';
import { SchemasResponseDto } from './dto/schemas-response.dto';
import { TelegramConnectDto } from './dto/telegram-connect.dto';
import { TestIntegrationDto } from './dto/test-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { IntegrationsService } from './integrations.service';
import { TelegramConnectService } from './telegram-connect.service';
import { TelegramWebhookService } from './telegram-webhook.service';
import { AwsSsoService } from './connectors/aws/aws-sso.service';

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly telegramConnectService: TelegramConnectService,
    private readonly telegramWebhookService: TelegramWebhookService,
    private readonly awsSsoService: AwsSsoService,
  ) {}

  @Doc({
    summary: 'Get all integration schemas',
    description:
      'Returns the JSON Schema (Draft 2020-12) for all supported integration configurations. Used by the console to render dynamic forms.',
    response: {
      serialization: SchemasResponseDto,
    },
  })
  @WorkspaceAccess('integration.read')
  @Get('schemas')
  getSchemas() {
    const schema = this.integrationsService.getSchemas();
    return { schema };
  }

  @Doc({
    summary: 'Create a new integration',
    description:
      'Connects a third-party application to the specified workspace. Config is validated against the JSON Schema for the given appType + category.',
    response: {
      serialization: GetIntegrationDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @AuditLog('integration.connected', {
    resourceId: (result) => (result as GetIntegrationDto | undefined)?.id,
    changes: (body) => {
      const appType = (body as CreateIntegrationDto | undefined)?.appType;
      const changes: Record<string, { after?: unknown }> = {};
      if (appType) changes.type = { after: appType };
      return changes;
    },
  })
  @Post()
  createIntegration(
    @Body() dto: CreateIntegrationDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.integrationsService.createIntegration({
      name: dto.name,
      description: dto.description,
      appType: dto.appType,
      category: dto.category,
      config: dto.config,
      workspaceId,
      userId,
      syncSchedule: dto.syncSchedule,
    });
  }

  @Doc({
    summary: 'Get all integrations for a workspace',
    description:
      'Returns a paginated list of integrations in the specified workspace. Supports search and filters.',
    response: {
      serialization: GetManyResponseDto(GetIntegrationDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.read')
  @Get()
  getManyIntegrations(
    @Query() query: GetManyIntegrationsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.integrationsService.getManyIntegrations(query, workspaceId);
  }

  @Doc({
    summary: 'Get an integration by ID',
    description:
      'Returns the configuration for a specific integration in the workspace. Sensitive fields are masked.',
    response: {
      serialization: GetIntegrationDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.read')
  @Get(':id')
  getIntegrationById(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.integrationsService.getIntegrationById(id, workspaceId);
  }

  @Doc({
    summary: 'Update an integration',
    description:
      'Updates the name, description, or config of an existing integration. If config is provided, it is validated against the JSON Schema. Empty body returns the current state unchanged.',
    response: {
      serialization: GetIntegrationDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @AuditLog('integration.settings.updated', {
    resourceId: (result) => (result as GetIntegrationDto | undefined)?.id,
    changes: (body) => {
      const dto = body as UpdateIntegrationDto | undefined;
      const changes: Record<string, { after?: unknown }> = {};
      if (dto?.name !== undefined) {
        changes.name = { after: dto.name };
      }
      if (dto?.description !== undefined) {
        changes.description = { after: dto.description };
      }
      if (dto?.syncSchedule !== undefined) {
        changes.syncSchedule = { after: dto.syncSchedule };
      }
      return changes;
    },
  })
  @Patch(':id')
  updateIntegration(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateIntegrationDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.integrationsService.updateIntegration(id, workspaceId, dto);
  }

  @Doc({
    summary: 'Delete an integration',
    description:
      'Permanently removes an integration from the specified workspace.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @AuditLog('integration.disconnected')
  @Delete(':id')
  deleteIntegration(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.integrationsService.deleteIntegration(id, workspaceId);
  }

  @Doc({
    summary: 'Test an integration',
    description:
      'Sends a test payload using the integration connector. The connector class is resolved by appType and the correct method is dispatched by category — no if/else chains.',
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @Post(':id/test')
  @HttpCode(200)
  testIntegration(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: TestIntegrationDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.integrationsService.testIntegration(id, workspaceId, dto);
  }

  @Doc({
    summary: 'Enqueue an integration sync',
    description:
      'Queues an immediate asset sync for a cloud-provider integration (e.g. Cloudflare) and returns the jobId. The sync runs asynchronously: the connector fetches zones + DNS records and ingests them as targets/assets. A second call while the first job is still pending returns the same jobId (no duplicate sync).',
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @Post(':id/sync')
  @HttpCode(200)
  async syncIntegration(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ) {
    const { jobId } = await this.integrationsService.syncIntegration(
      id,
      workspaceId,
    );
    return { success: true, message: 'Sync queued', jobId };
  }

  // ─── AWS SSO device-authorization flow ─────────────────────────

  @Doc({
    summary: 'Start an AWS SSO device authorization',
    description:
      'Registers a public OIDC client and starts the IAM Identity Center device-authorization flow. Returns the client credentials, device/user codes and verification URIs the console displays. No integration is created until `complete`.',
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @AuditLog('integration.connected')
  @Post('aws/sso/device')
  @HttpCode(200)
  startAwsSsoDevice(@Body() dto: AwsSsoDeviceDto) {
    return this.awsSsoService.startDeviceAuth({
      region: dto.region,
      startUrl: dto.startUrl,
    });
  }

  @Doc({
    summary: 'Poll an AWS SSO device authorization',
    description:
      'Polls the device-code grant. While pending/slow_down only the status is returned; once authorized the SSO accounts (and their roles) accessible to the signed-in user are returned.',
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @AuditLog('integration.connected')
  @Post('aws/sso/poll')
  @HttpCode(200)
  async pollAwsSsoDevice(@Body() dto: AwsSsoPollDto) {
    const result = await this.awsSsoService.pollDeviceAuth({
      region: dto.region,
      clientId: dto.clientId,
      clientSecret: dto.clientSecret,
      deviceCode: dto.deviceCode,
    });

    if (result.status !== 'authorized') {
      return { status: result.status };
    }

    const ssoAccounts = await this.awsSsoService.listSsoAccounts({
      region: dto.region,
      accessToken: result.accessToken,
    });
    const accounts = await Promise.all(
      ssoAccounts.map(async (account) => {
        const roles = await this.awsSsoService.listSsoRoles({
          region: dto.region,
          accessToken: result.accessToken,
          accountId: account.accountId,
        });
        return {
          accountId: account.accountId,
          accountName: account.accountName,
          roles: roles.map((role) => role.roleName),
        };
      }),
    );

    return {
      status: 'authorized' as const,
      refreshToken: result.refreshToken,
      accounts,
    };
  }

  @Doc({
    summary: 'Complete an AWS SSO connection',
    description:
      'Creates the AWS integration from the selected account/role and the refresh token acquired by the device flow. Config secrets are encrypted at rest and masked in the response.',
    response: {
      serialization: GetIntegrationDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @AuditLog('integration.connected', {
    resourceId: (result) => (result as GetIntegrationDto | undefined)?.id,
  })
  @Post('aws/sso/complete')
  completeAwsSso(
    @Body() dto: AwsSsoCompleteDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.integrationsService.createIntegration({
      name: dto.name,
      description: undefined,
      appType: 'aws',
      category: IntegrationType.CLOUD_PROVIDER,
      config: {
        connectionMethod: 'sso',
        region: dto.region,
        startUrl: dto.startUrl,
        accountId: dto.accountId,
        roleName: dto.roleName,
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        refreshToken: dto.refreshToken,
      },
      workspaceId,
      userId,
      syncSchedule: dto.syncSchedule,
    });
  }

  // ─── Telegram-specific endpoints ───────────────────────────────

  @Doc({
    summary: 'Create a Telegram pairing token',
    description:
      'Generates a unique 48-char connect token for the given Telegram integration. The user sends this token to the bot via /start <token> to pair their Telegram chat.',
    response: {
      serialization: TelegramConnectDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @Post(':id/telegram/pairing')
  createTelegramPairing(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Query('force') forceParam?: string,
  ) {
    const force = forceParam === 'true';
    return this.telegramConnectService.createPairing(
      id,
      workspaceId,
      userId,
      force,
    );
  }

  @Doc({
    summary: 'Telegram bot webhook',
    description:
      'Receives incoming updates from Telegram via webhook. Each integration has a unique webhook URL including the integration ID. Parses /start <token> messages to pair chats.',
  })
  @Public()
  @HttpCode(200)
  @Post('telegram/webhook/:integrationId')
  async telegramWebhook(
    @Param('integrationId') integrationId: string,
    @Body() update: unknown,
  ) {
    // Resolve bot token so /start without token can reply with instructions
    let botToken: string | undefined;
    try {
      const { decryptedConfig } =
        await this.integrationsService.getDecryptedIntegrationById(
          integrationId,
        );
      botToken = decryptedConfig.botToken as string | undefined;
    } catch {
      // Integration not found or decryption failed — proceed without botToken
    }

    await this.telegramWebhookService.processUpdate(
      update as Parameters<TelegramWebhookService['processUpdate']>[0],
      { botToken, integrationId },
    );
    return { ok: true };
  }

  @Doc({
    summary: 'List Telegram connects for an integration',
    description:
      'Returns all Telegram chat connections (paired users) for the given integration.',
    response: {
      serialization: TelegramConnectDto,
      isArray: true,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.read')
  @Get(':id/telegram/connects')
  getTelegramConnects(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.telegramConnectService.getConnects(id, workspaceId, userId);
  }

  @Doc({
    summary: 'Disconnect a Telegram connect',
    description: 'Disconnects a specific Telegram chat from the integration.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('integration.write')
  @Delete(':id/telegram/connects/:connectId')
  disconnectTelegramConnect(
    @Param('id') id: string,
    @Param('connectId') connectId: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.telegramConnectService.disconnect(
      connectId,
      id,
      workspaceId,
      userId,
    );
  }
}
