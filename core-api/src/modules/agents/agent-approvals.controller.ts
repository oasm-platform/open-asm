import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { AgentCommandApprovalStatus } from '@/modules/agents/enums/agent.enums';
import { AuthGuard } from '@/common/guards/auth.guard';
import { GetManyResponseDto } from '@/common/utils/get-many-response.util';
import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentsApprovalsService } from './agents.approvals';
import { AgentCommandApproval } from './entities/agent-command-approval.entity';
import {
  CommandApprovalResponseDto,
  DecideCommandApprovalDto,
  DecidePlanApprovalDto,
  GetCommandApprovalsQueryDto,
} from './dto/command-approval.dto';

/** Command and plan approvals of chat runs (`agents/command-approvals`, `agents/plan-approvals`). */
@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentApprovalsController {
  constructor(
    private readonly agentsApprovalsService: AgentsApprovalsService,
  ) {}

  @WorkspaceAccess('agent.read')
  @Get('command-approvals')
  @Doc({
    operationId: 'AgentsController_listCommandApprovals',
    summary: 'List command approvals',
    description:
      'Paginated history of commands the current user approved or rejected, newest first',
    request: { getWorkspaceId: true },
    response: {
      serialization: GetManyResponseDto(CommandApprovalResponseDto),
    },
  })
  listCommandApprovals(
    @Query() query: GetCommandApprovalsQueryDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<GetManyBaseResponseDto<CommandApprovalResponseDto>> {
    return this.agentsApprovalsService.list(workspaceId, userId, query);
  }

  @WorkspaceAccess('agent.write')
  @Patch('command-approvals/:id')
  @Doc({
    operationId: 'AgentsController_decideCommandApproval',
    summary: 'Approve or reject a command',
    description: 'Decide a pending agent command; unblocks the running agent',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Approval ID' }],
    },
    response: { serialization: AgentCommandApproval },
  })
  decideCommandApproval(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: DecideCommandApprovalDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentCommandApproval> {
    return this.agentsApprovalsService.decide(
      id,
      dto.status,
      workspaceId,
      userId,
      {
        allowConversation: dto.allowConversation,
        allowTool: dto.allowTool,
        feedback: dto.feedback,
      },
    );
  }

  @WorkspaceAccess('agent.write')
  @Patch('plan-approvals/:id')
  @Doc({
    operationId: 'AgentsController_decidePlanApproval',
    summary: 'Approve or reject a plan',
    description:
      'Decide a plan the agent is waiting on (PLAN approval mode); approving picks whether it runs in auto or manual mode',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Approval ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  decidePlanApproval(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: DecidePlanApprovalDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): DefaultMessageResponseDto {
    const allowed = dto.status === AgentCommandApprovalStatus.APPROVED;
    this.agentsApprovalsService.decidePlan(id, workspaceId, userId, {
      allowed,
      mode: dto.mode,
      feedback: dto.feedback,
    });
    return { message: allowed ? 'Plan approved' : 'Plan rejected' };
  }

  @WorkspaceAccess('agent.write')
  @Delete('command-approvals/:id')
  @Doc({
    operationId: 'AgentsController_revokeCommandApproval',
    summary: 'Revoke a command approval',
    description: 'Forget a remembered decision so the command asks again',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Approval ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async revokeCommandApproval(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsApprovalsService.revoke(id, workspaceId, userId);
    return { message: 'Approval revoked' };
  }
}
