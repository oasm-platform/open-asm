import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { GetManyResponseDto } from '@/common/utils/get-many-response.util';
import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentsConfigService } from './agents.config';
import { AgentsService } from './agents.service';
import {
  AgentConfigResponseDto,
  UpsertAgentConfigDto,
} from './dto/agent-config.dto';
import { WorkspaceMemoryResponseDto } from './dto/workspace-memory.dto';

/** Per-user agent settings and the workspace long-term memory (`agents/config`, `agents/workspace-memory`). */
@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentSettingsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsConfigService: AgentsConfigService,
  ) {}

  // ==========================================
  // Agent Config Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('config')
  @Doc({
    operationId: 'AgentsController_getAgentConfig',
    summary: 'Get agent config',
    description:
      "Get the current user's agent settings in the workspace: models, web search providers and instructions",
    request: { getWorkspaceId: true },
    response: { serialization: AgentConfigResponseDto },
  })
  getAgentConfig(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentConfigResponseDto> {
    return this.agentsConfigService.get(workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Put('config')
  @Doc({
    operationId: 'AgentsController_upsertAgentConfig',
    summary: 'Update agent config',
    description:
      "Update the current user's agent settings in the workspace. Only the fields sent change",
    request: { getWorkspaceId: true },
    response: { serialization: AgentConfigResponseDto },
  })
  upsertAgentConfig(
    @Body() dto: UpsertAgentConfigDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentConfigResponseDto> {
    return this.agentsConfigService.upsert(workspaceId, userId, dto);
  }

  // ==========================================
  // Workspace Memory Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('workspace-memory')
  @Doc({
    operationId: 'AgentsController_getWorkspaceMemory',
    summary: 'Get workspace memory',
    description:
      'Get long-term memory records for the workspace (paginated, per user)',
    request: { getWorkspaceId: true },
    response: { serialization: GetManyResponseDto(WorkspaceMemoryResponseDto) },
  })
  getWorkspaceMemory(
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<GetManyBaseResponseDto<WorkspaceMemoryResponseDto>> {
    return this.agentsService.getWorkspaceMemory(workspaceId, userId, query);
  }

  @WorkspaceAccess('agent.write')
  @Delete('workspace-memory/:id')
  @Doc({
    operationId: 'AgentsController_deleteWorkspaceMemory',
    summary: 'Delete workspace memory',
    description: 'Delete a long-term memory record by ID',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Memory record ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteWorkspaceMemory(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteWorkspaceMemory(id, workspaceId, userId);
    return { message: 'Memory deleted successfully' };
  }
}
