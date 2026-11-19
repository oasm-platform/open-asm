import { WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { Body, Controller, Delete, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentsService } from './agents.service';
import {
  MCPConfigResponseDto,
  MCPServerConfigDto,
  MCPServerPingResponseDto,
  MCPServerResponseDto,
  ToggleMCPServerDto,
} from './dto/mcp-config.dto';

/** The workspace's external MCP servers (`agents/mcp-configs`). */
@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentMcpConfigsController {
  constructor(
    private readonly agentsService: AgentsService,
  ) {}

  @WorkspaceAccess('agent.read')
  @Get('mcp-configs')
  @Doc({
    operationId: 'AgentsController_getMCPConfig',
    summary: 'Get MCP configs',
    description: 'Get all MCP server configurations for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: MCPConfigResponseDto },
  })
  getMCPConfig(
    @WorkspaceId() workspaceId: string,
  ): Promise<MCPConfigResponseDto> {
    return this.agentsService.getMCPConfig(workspaceId);
  }

  @WorkspaceAccess('agent.write')
  @Put('mcp-configs/:name')
  @Doc({
    operationId: 'AgentsController_upsertMCPServer',
    summary: 'Upsert MCP server',
    description: 'Add or update an MCP server configuration',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'name', description: 'MCP server name' }],
    },
    response: { serialization: MCPServerResponseDto },
  })
  upsertMCPServer(
    @Param('name') name: string,
    @Body() dto: MCPServerConfigDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<MCPServerResponseDto> {
    return this.agentsService.upsertMCPServer(workspaceId, name, dto);
  }

  @WorkspaceAccess('agent.write')
  @Delete('mcp-configs/:name')
  @Doc({
    operationId: 'AgentsController_deleteMCPServer',
    summary: 'Delete MCP server',
    description: 'Remove an MCP server configuration',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'name', description: 'MCP server name' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteMCPServer(
    @Param('name') name: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteMCPServer(workspaceId, name);
    return { message: 'MCP server deleted successfully' };
  }

  @WorkspaceAccess('agent.write')
  @Patch('mcp-configs/:name/toggle')
  @Doc({
    operationId: 'AgentsController_toggleMCPServer',
    summary: 'Toggle MCP server',
    description: 'Enable or disable an MCP server',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'name', description: 'MCP server name' }],
    },
    response: { serialization: MCPServerResponseDto },
  })
  toggleMCPServer(
    @Param('name') name: string,
    @Body() dto: ToggleMCPServerDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<MCPServerResponseDto> {
    return this.agentsService.toggleMCPServer(workspaceId, name, dto.disabled);
  }

  @WorkspaceAccess('agent.read')
  @Get('mcp-configs/:name/ping')
  @Doc({
    operationId: 'AgentsController_pingMCPServer',
    summary: 'Ping MCP server',
    description: 'Check connectivity status of an MCP server',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'name', description: 'MCP server name' }],
    },
    response: { serialization: MCPServerPingResponseDto },
  })
  pingMCPServer(
    @Param('name') name: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<MCPServerPingResponseDto> {
    return this.agentsService.pingMCPServer(workspaceId, name);
  }
}
