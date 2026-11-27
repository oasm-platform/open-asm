import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { AuthGuard } from '@/common/guards/auth.guard';
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentHttpRequestsService } from './http-requests/agent-http-requests.service';
import {
  AgentHttpRequestDetailDto,
  AgentHttpRequestListResponseDto,
  GetAgentHttpRequestsQueryDto,
} from './http-requests/dto/agent-http-request.dto';

/** HTTP requests the caller's agent shell commands made through the worker egress proxy (`agents/http-requests`). */
@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentHttpRequestsController {
  constructor(private readonly httpRequests: AgentHttpRequestsService) {}

  @WorkspaceAccess('agent.read')
  @Get('http-requests')
  @Doc({
    summary: 'List agent HTTP requests',
    description:
      'Keyset-paginated HTTP requests made by the current user\'s agent commands, newest first',
    request: { getWorkspaceId: true },
    response: { serialization: AgentHttpRequestListResponseDto },
  })
  getHttpRequests(
    @Query() query: GetAgentHttpRequestsQueryDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentHttpRequestListResponseDto> {
    return this.httpRequests.list(workspaceId, userId, query);
  }

  @WorkspaceAccess('agent.read')
  @Get('http-requests/:id')
  @Doc({
    summary: 'Get an agent HTTP request',
    description: 'One logged request with its headers, bodies and the command that made it',
    request: { getWorkspaceId: true },
    response: { serialization: AgentHttpRequestDetailDto },
  })
  getHttpRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentHttpRequestDetailDto> {
    return this.httpRequests.get(workspaceId, userId, id);
  }
}
