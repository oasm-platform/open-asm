import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentsService } from './agents.service';
import { AgentsUsageService } from './agents.usage';
import { GetAgentModesResponseDto } from './dto/agent-mode.dto';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
  LLMProviderSupportedDto,
  ProviderModelDto,
  UpdateLLMConfigDto,
} from './dto/llm-config.dto';
import { AgentUsageResponseDto, GetAgentUsageQueryDto } from './dto/usage.dto';

/** Chat modes, LLM providers, the user's LLM connections and usage (`agents/modes`, `providers`, `llm-configs`, `usage`). */
@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentModelsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsUsageService: AgentsUsageService,
  ) {}

  @WorkspaceAccess('agent.read')
  @Get('modes')
  @Doc({
    operationId: 'AgentsController_getAgentModes',
    summary: 'Get agent modes',
    description: 'Get all available modes for AI chat box and enabled workers',
    request: { getWorkspaceId: true },
    response: { serialization: GetAgentModesResponseDto },
  })
  getAgentModes(
    @WorkspaceId() workspaceId: string,
  ): Promise<GetAgentModesResponseDto> {
    return this.agentsService.getAgentModesWithWorkers(workspaceId);
  }

  @WorkspaceAccess('agent.write')
  @Post('llm-configs')
  @Doc({
    operationId: 'AgentsController_createLLMConfig',
    summary: 'Create LLM config',
    description: 'Create a new LLM provider configuration',
    request: { getWorkspaceId: true },
    response: { serialization: LLMConfigResponseDto },
  })
  async createLLMConfig(
    @Body() dto: CreateLLMConfigDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<LLMConfigResponseDto> {
    return this.agentsService.createLLMConfig(dto, workspaceId, userId);
  }

  @WorkspaceAccess('agent.read')
  @Get('providers')
  @Doc({
    operationId: 'AgentsController_getProviders',
    summary: 'Get supported providers',
    description: 'Get all supported LLM providers with their metadata',
    response: { serialization: LLMProviderSupportedDto, isArray: true },
  })
  getProviders(): LLMProviderSupportedDto[] {
    return this.agentsService.getProviders();
  }

  @WorkspaceAccess('agent.read')
  @Get('providers/connected')
  @Doc({
    operationId: 'AgentsController_getConnectedProviders',
    summary: 'Get connected providers',
    description:
      'Get all connected LLM provider configurations for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: LLMConfigWithProviderDto, isArray: true },
  })
  getConnectedProviders(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<LLMConfigWithProviderDto[]> {
    return this.agentsService.getConnectedProviders(workspaceId, userId);
  }

  @WorkspaceAccess('agent.read')
  @Get('llm-configs/:id/models')
  @Doc({
    operationId: 'AgentsController_getProviderModels',
    summary: 'List models for a provider config',
    description:
      'Get available models for a specific LLM provider configuration',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'LLM config ID' }],
    },
    response: { serialization: ProviderModelDto, isArray: true },
  })
  async getProviderModels(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<ProviderModelDto[]> {
    return this.agentsService.getModelsForProvider(id, workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Patch('llm-configs/:id')
  @Doc({
    operationId: 'AgentsController_updateLLMConfig',
    summary: 'Update LLM config',
    description: 'Update an existing LLM configuration',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'LLM config ID' }],
    },
    response: { serialization: LLMConfigResponseDto },
  })
  async updateLLMConfig(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateLLMConfigDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<LLMConfigResponseDto> {
    return this.agentsService.updateLLMConfig(id, dto, workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Delete('llm-configs/:id')
  @Doc({
    operationId: 'AgentsController_deleteLLMConfig',
    summary: 'Delete LLM config',
    description: 'Delete an LLM configuration',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'LLM config ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteLLMConfig(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteLLMConfig(id, workspaceId, userId);
    return { message: 'LLM config deleted successfully' };
  }

  @WorkspaceAccess('agent.write')
  @Patch('llm-configs/:id/set-preferred')
  @Doc({
    operationId: 'AgentsController_setPreferredLLMConfig',
    summary: 'Set preferred LLM config',
    description: 'Set an LLM config as the preferred one for the workspace',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'LLM config ID' }],
    },
    response: { serialization: LLMConfigResponseDto },
  })
  async setPreferredLLMConfig(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<LLMConfigResponseDto> {
    return this.agentsService.setPreferredLLMConfig(id, workspaceId, userId);
  }

  @WorkspaceAccess('agent.read')
  @Get('usage')
  @Doc({
    operationId: 'AgentsController_getUsage',
    summary: 'Get AI Studio usage',
    description:
      'Tokens, cost and sessions of the current user in the workspace, per day, model and conversation',
    request: { getWorkspaceId: true },
    response: { serialization: AgentUsageResponseDto },
  })
  getUsage(
    @Query() query: GetAgentUsageQueryDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentUsageResponseDto> {
    return this.agentsUsageService.getUsage(workspaceId, userId, query);
  }
}
