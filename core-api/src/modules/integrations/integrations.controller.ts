import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
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
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
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

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly telegramConnectService: TelegramConnectService,
    private readonly telegramWebhookService: TelegramWebhookService,
  ) {}

  @Doc({
    summary: 'Get all integration schemas',
    description:
      'Returns the JSON Schema (Draft 2020-12) for all supported integration configurations. Used by the console to render dynamic forms.',
    response: {
      serialization: SchemasResponseDto,
    },
  })
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
  @Post(':id/test')
  @HttpCode(200)
  testIntegration(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: TestIntegrationDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.integrationsService.testIntegration(id, workspaceId, dto);
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
    await this.telegramWebhookService.processUpdate(
      update as Parameters<TelegramWebhookService['processUpdate']>[0],
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
  @Delete(':id/telegram/connects/:connectId')
  disconnectTelegramConnect(
    @Param('id') id: string,
    @Param('connectId') connectId: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.telegramConnectService.disconnect(connectId, id, workspaceId);
  }
}
