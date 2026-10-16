import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { AgentCommandApprovalStatus } from '@/common/enums/enum';
import { AuthGuard } from '@/common/guards/auth.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { Response } from 'express';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsApprovalsService } from './agents.approvals';
import { AgentsConfigService } from './agents.config';
import { AgentsDefinitionsService } from './agents.definitions';
import { AgentsService } from './agents.service';
import {
  AgentConfigResponseDto,
  UpsertAgentConfigDto,
} from './dto/agent-config.dto';
import { AgentCommandApproval } from './entities/agent-command-approval.entity';
import {
  CommandApprovalResponseDto,
  DecideCommandApprovalDto,
  DecidePlanApprovalDto,
  GetCommandApprovalsQueryDto,
} from './dto/command-approval.dto';
import { AgentsSkillsService } from './agents.skills';
import { GetAgentModesResponseDto } from './dto/agent-mode.dto';
import { SubagentResponseDto } from './dto/conversation-stats.dto';
import {
  ConversationResponseDto,
  UpdateConversationDto,
} from './dto/conversation.dto';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
  LLMProviderSupportedDto,
  ProviderModelDto,
  UpdateLLMConfigDto,
} from './dto/llm-config.dto';
import {
  MCPConfigResponseDto,
  MCPServerConfigDto,
  MCPServerPingResponseDto,
  MCPServerResponseDto,
  ToggleMCPServerDto,
} from './dto/mcp-config.dto';
import { MessageResponseDto, SendMessageDto } from './dto/message.dto';
import {
  CreateSkillDto,
  SkillResponseDto,
  ToggleSkillDto,
  UpdateSkillDto,
} from './dto/skill.dto';
import { WorkspaceMemoryResponseDto } from './dto/workspace-memory.dto';
import {
  AgentDefinitionResponseDto,
  CreateAgentDefinitionDto,
  UpdateAgentDefinitionDto,
} from './dto/agent-definition.dto';

/** Longest a stopped run is still reported as running while it saves */
const STOP_SETTLE_TIMEOUT_MS = 30_000;

/** Resolves `ms` after the signal aborts; never resolves while it does not */
function afterAbort(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = () => setTimeout(resolve, ms).unref();
    if (signal.aborted) start();
    else signal.addEventListener('abort', start, { once: true });
  });
}

@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsCompletionsService: AgentsCompletionsService,
    private readonly agentsSkillsService: AgentsSkillsService,
    private readonly agentsApprovalsService: AgentsApprovalsService,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly agentsDefinitionsService: AgentsDefinitionsService,
  ) {}

  @WorkspaceAccess('agent.read')
  @Get('modes')
  @Doc({
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

  @WorkspaceAccess('agent.read')
  @Get('command-approvals')
  @Doc({
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

  @WorkspaceAccess('agent.write')
  @Post('llm-configs')
  @Doc({
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

  // ==========================================
  // Conversation Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id')
  @Doc({
    summary: 'Get conversation detail',
    description: 'Get a single conversation with full details including todos',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: ConversationResponseDto },
  })
  async getConversation(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<ConversationResponseDto> {
    return this.agentsService.getConversation(id, workspaceId, userId);
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/subagents')
  @Doc({
    summary: 'List conversation subagents',
    description:
      'Background subagent tasks dispatched in this conversation, with status and result',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: SubagentResponseDto, isArray: true },
  })
  async getConversationSubagents(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SubagentResponseDto[]> {
    return this.agentsService.getConversationSubagents(
      id,
      workspaceId,
      userId,
    );
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations')
  @Doc({
    summary: 'List conversations',
    description: 'Get all conversations for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: GetManyResponseDto(ConversationResponseDto) },
  })
  async getConversations(
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.agentsService.getConversations(workspaceId, userId, query);
  }

  @WorkspaceAccess('agent.write')
  @Patch('conversations/:id')
  @Doc({
    summary: 'Update conversation',
    description: 'Update a conversation title',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: ConversationResponseDto },
  })
  async updateConversation(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateConversationDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<ConversationResponseDto> {
    return this.agentsService.updateConversation(id, dto, workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Delete('conversations')
  @Doc({
    summary: 'Delete all conversations',
    description:
      'Delete all conversations and their messages for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteAllConversations(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteAllConversations(workspaceId, userId);
    return { message: 'All conversations deleted successfully' };
  }

  @WorkspaceAccess('agent.write')
  @Delete('conversations/:id')
  @Doc({
    summary: 'Delete conversation',
    description: 'Delete a conversation and all its messages',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteConversation(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteConversation(id, workspaceId, userId);
    return { message: 'Conversation deleted successfully' };
  }

  // ==========================================
  // Message / Chat Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/messages')
  @Doc({
    summary: 'Get messages',
    description: 'Get all messages in a conversation',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: GetManyResponseDto(MessageResponseDto) },
  })
  async getMessages(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<
    GetManyBaseResponseDto<MessageResponseDto> & { running: boolean }
  > {
    // Lets a client that lost the stream keep polling until the whole run
    // ends, including the gaps between continuation iterations. Read before
    // the messages: `running: false` then means they were read after the
    // run saved its final state.
    const running = this.agentsCompletionsService.isRunActive(id);
    const result = await this.agentsService.getMessages(
      id,
      workspaceId,
      userId,
      query,
    );
    return { ...result, running };
  }

  @WorkspaceAccess('agent.read')
  @Post('messages/stream')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Send message (streaming)',
    description:
      'Send a message and receive a streaming response via SSE. ' +
      'If conversationId is not provided, a new conversation is created using the preferred LLM config.',
    request: { getWorkspaceId: true },
  })
  async streamMessage(
    @Body() dto: SendMessageDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Res() res: Response,
  ): Promise<void> {
    // The run outlives this HTTP request. A client disconnect (navigating to
    // another conversation/tab) must NOT kill it: we keep draining the stream
    // server-side so it finishes and persists, and the user sees the result on
    // return. Only an explicit stop (POST .../stop) aborts the run.
    const abortController = new AbortController();
    let clientGone = false;
    const canWrite = () => !clientGone && !res.writableEnded;

    // Listen on the response: the request already emitted 'close' once the
    // body parser consumed it, so a listener on req would never fire.
    const onClientDisconnect = () => {
      clientGone = true;
    };
    res.on('close', onClientDisconnect);

    let activeConversationId: string | undefined;
    let runSettled: Promise<void> | undefined;
    try {
      const { stream, conversationId, settled } =
        await this.agentsCompletionsService.streamMessage(
          dto,
          workspaceId,
          userId,
          abortController.signal,
        );
      activeConversationId = conversationId;
      runSettled = settled;
      if (conversationId) {
        this.agentsCompletionsService.registerActiveRun(
          conversationId,
          abortController,
        );
      }

      if (canWrite()) {
        res.socket?.setNoDelay(true);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Content-Encoding', 'identity');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader(
          'X-Conversation-Id',
          conversationId || dto.conversationId || '',
        );
        res.flushHeaders();
      }

      // Headers are now committed — from this point on we can only write SSE events

      // SSE keepalive heartbeat: emit comment every 15s to prevent
      // proxy/load-balancer timeouts on long-running streams.
      const keepaliveInterval = setInterval(() => {
        if (canWrite()) {
          res.write(':keepalive\n\n');
        }
      }, 15_000);

      try {
        const reader = stream.getReader();
        while (true) {
          // An explicit stop cancels the run; a mere disconnect does not
          if (abortController.signal.aborted) {
            await reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;
          // Keep reading even after the client left, so the run reaches its
          // end and persists; just stop writing to the dead socket.
          if (canWrite()) {
            res.write(`data: ${JSON.stringify(value)}\n\n`);
          }
        }
        // Send [DONE] marker to properly terminate the SSE stream
        if (canWrite()) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError) {
        if (abortController.signal.aborted || clientGone) {
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        const message =
          streamError instanceof Error
            ? streamError.message
            : typeof streamError === 'string'
              ? streamError
              : 'Stream error';
        if (canWrite()) {
          res.write(
            `data: ${JSON.stringify({ type: 'error', error: { message } })}\n\n`,
          );
          res.end();
        }
      } finally {
        clearInterval(keepaliveInterval);
      }
    } catch (error) {
      if (clientGone) return;
      if (error instanceof BadRequestException) {
        res.status(400).json({
          message: error.message,
          error: 'Bad Request',
          statusCode: 400,
        });
      } else {
        res.status(500).json({
          message:
            error instanceof Error ? error.message : 'Internal server error',
          error: 'Internal Server Error',
          statusCode: 500,
        });
      }
    } finally {
      res.off('close', onClientDisconnect);
      if (activeConversationId) {
        const conversationId = activeConversationId;
        const clear = () =>
          this.agentsCompletionsService.clearActiveRun(
            conversationId,
            abortController,
          );
        // After a stop this request ends before the run has saved its stopped
        // state; keep reporting it as running until then, but not forever
        // (a tool may ignore the abort)
        if (runSettled) {
          void Promise.race([
            runSettled,
            afterAbort(abortController.signal, STOP_SETTLE_TIMEOUT_MS),
          ]).finally(clear);
        } else {
          clear();
        }
      }
    }
  }

  @WorkspaceAccess('agent.write')
  @Post('conversations/:id/stop')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Stop the active response',
    description:
      'Aborts the in-progress agent run of a conversation. Use this instead of ' +
      'dropping the stream connection, which now lets the run finish in the background.',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async stopConversation(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    // Ownership check (throws NotFound if the conversation is not the user's)
    await this.agentsService.getConversation(id, workspaceId, userId);
    const stopped = this.agentsCompletionsService.stopRun(id);
    return { message: stopped ? 'Response stopped' : 'No active response' };
  }

  @WorkspaceAccess('agent.write')
  @Delete('conversations/:cid/messages/:mid')
  @Doc({
    summary: 'Delete message',
    description: 'Delete a specific message in a conversation',
    request: {
      getWorkspaceId: true,
      params: [
        { name: 'cid', description: 'Conversation ID' },
        { name: 'mid', description: 'Message ID' },
      ],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteMessage(
    @Param('cid') conversationId: string,
    @Param('mid') messageId: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteMessage(
      conversationId,
      messageId,
      workspaceId,
      userId,
    );
    return { message: 'Message deleted successfully' };
  }

  @WorkspaceAccess('agent.read')
  @Get('mcp-configs')
  @Doc({
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

  // ==========================================
  // Agent Config Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('config')
  @Doc({
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

  // ==========================================
  // Agent Definitions Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('definitions')
  @Doc({
    summary: 'List agent definitions',
    description:
      "Built-in agents, the workspace's shared agents and the current user's personal agents",
    request: { getWorkspaceId: true },
    response: { serialization: AgentDefinitionResponseDto, isArray: true },
  })
  getAgentDefinitions(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentDefinitionResponseDto[]> {
    return this.agentsDefinitionsService.list(workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Post('definitions')
  @Doc({
    summary: 'Create agent definition',
    description:
      'Create a personal (scope user) or workspace-shared agent. The name is a slug mentioned as @name',
    request: { getWorkspaceId: true },
    response: { serialization: AgentDefinitionResponseDto },
  })
  createAgentDefinition(
    @Body() dto: CreateAgentDefinitionDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentDefinitionResponseDto> {
    return this.agentsDefinitionsService.create(workspaceId, userId, dto);
  }

  @WorkspaceAccess('agent.write')
  @Patch('definitions/:id')
  @Doc({
    summary: 'Update agent definition',
    description: 'Update a custom agent you created',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Agent definition ID' }],
    },
    response: { serialization: AgentDefinitionResponseDto },
  })
  updateAgentDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDefinitionDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<AgentDefinitionResponseDto> {
    return this.agentsDefinitionsService.update(workspaceId, userId, id, dto);
  }

  @WorkspaceAccess('agent.write')
  @Delete('definitions/:id')
  @Doc({
    summary: 'Delete agent definition',
    description: 'Delete a custom agent you created',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Agent definition ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteAgentDefinition(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsDefinitionsService.delete(workspaceId, userId, id);
    return { message: 'Agent deleted successfully' };
  }

  // ==========================================
  // Skills Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('skills')
  @Doc({
    summary: 'List skills',
    description: 'Get all available skills (builtin + user) for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: SkillResponseDto, isArray: true },
  })
  getSkills(@WorkspaceId() workspaceId: string): Promise<SkillResponseDto[]> {
    return this.agentsSkillsService.getSkills(workspaceId);
  }

  @WorkspaceAccess('agent.write')
  @Post('skills')
  @Doc({
    summary: 'Create skill',
    description:
      'Create a new user skill for the workspace (workspace owner only)',
    request: { getWorkspaceId: true },
    response: { serialization: SkillResponseDto },
  })
  async createSkill(
    @Body() dto: CreateSkillDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsSkillsService.createUserSkill(workspaceId, userId, dto);
  }

  @WorkspaceAccess('agent.write')
  @Patch('skills/:id')
  @Doc({
    summary: 'Update skill',
    description: 'Update a user skill (workspace owner only)',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: SkillResponseDto },
  })
  async updateSkill(
    @Param('id') id: string,
    @Body() dto: UpdateSkillDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsSkillsService.updateUserSkill(
      workspaceId,
      id,
      dto,
      userId,
    );
  }

  @WorkspaceAccess('agent.write')
  @Delete('skills/:id')
  @Doc({
    summary: 'Delete skill',
    description: 'Delete a user skill (workspace owner only)',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteSkill(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsSkillsService.deleteUserSkill(workspaceId, id, userId);
    return { message: 'Skill deleted successfully' };
  }

  @WorkspaceAccess('agent.write')
  @Patch('skills/:id/toggle')
  @Doc({
    summary: 'Toggle skill',
    description: 'Enable or disable a user skill (workspace owner only)',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: SkillResponseDto },
  })
  async toggleSkill(
    @Param('id') id: string,
    @Body() dto: ToggleSkillDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsSkillsService.toggleUserSkill(
      workspaceId,
      id,
      dto.isEnabled,
      userId,
    );
  }
}
