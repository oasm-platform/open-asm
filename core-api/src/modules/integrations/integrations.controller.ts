import {
  WorkspaceId,
  UserId,
} from '@/common/decorators/app.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { GetIntegrationDto } from './dto/get-integration.dto';
import { GetManyIntegrationsDto } from './dto/get-many-integrations.dto';
import { SchemasResponseDto } from './dto/schemas-response.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

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
}
