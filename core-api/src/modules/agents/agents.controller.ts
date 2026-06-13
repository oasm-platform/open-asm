import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
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
import { AgentsService } from './agents.service';
import { AgentsSkillsService } from './agents.skills';
import { GetAgentModesResponseDto } from './dto/agent-mode.dto';
import {
  ConversationResponseDto,
  UpdateConversationDto,
} from './dto/conversation.dto';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
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

@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsCompletionsService: AgentsCompletionsService,
    private readonly agentsSkillsService: AgentsSkillsService,
  ) {}

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

  @Get('llm-configs')
  @Doc({
    summary: 'List LLM configs with provider info',
    description:
      'Get all LLM providers with their configuration status for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: LLMConfigWithProviderDto, isArray: true },
  })
  getLLMConfigs(
    @WorkspaceId() workspaceId: string,
  ): Promise<LLMConfigWithProviderDto[]> {
    return this.agentsService.getLLMConfigsWithProviders(workspaceId);
  }

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
  ): Promise<ProviderModelDto[]> {
    return this.agentsService.getModelsForProvider(id, workspaceId);
  }

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
  ): Promise<LLMConfigResponseDto> {
    return this.agentsService.updateLLMConfig(id, dto, workspaceId);
  }

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
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteLLMConfig(id, workspaceId);
    return { message: 'LLM config deleted successfully' };
  }

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
  ): Promise<LLMConfigResponseDto> {
    return this.agentsService.setPreferredLLMConfig(id, workspaceId);
  }

  // ==========================================
  // Conversation Endpoints
  // ==========================================

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
  ): Promise<ConversationResponseDto> {
    return this.agentsService.getConversation(id, workspaceId);
  }

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
  ) {
    return this.agentsService.getConversations(workspaceId, query);
  }

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
  ): Promise<ConversationResponseDto> {
    return this.agentsService.updateConversation(id, dto, workspaceId);
  }

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
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteAllConversations(workspaceId);
    return { message: 'All conversations deleted successfully' };
  }

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
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteConversation(id, workspaceId);
    return { message: 'Conversation deleted successfully' };
  }

  // ==========================================
  // Message / Chat Endpoints
  // ==========================================

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
  ): Promise<GetManyBaseResponseDto<MessageResponseDto>> {
    return this.agentsService.getMessages(id, workspaceId, query);
  }

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
    // Create an AbortController that will be triggered when client disconnects
    const abortController = new AbortController();

    // Detect client disconnect via req.on('close')
    const req = res.req;
    const onClientDisconnect = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    if (req?.on) {
      req.on('close', onClientDisconnect);
    }

    try {
      const { stream, conversationId } =
        await this.agentsCompletionsService.streamMessage(
          dto,
          workspaceId,
          userId,
          abortController.signal,
        );

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

      // Headers are now committed — from this point on we can only write SSE events

      // SSE keepalive heartbeat: emit comment every 15s to prevent
      // proxy/load-balancer timeouts on long-running streams.
      const keepaliveInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(':keepalive\n\n');
        }
      }, 15_000);

      try {
        const reader = stream.getReader();
        while (true) {
          if (abortController.signal.aborted) {
            await reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;
          res.write(`data: ${JSON.stringify(value)}\n\n`);
        }
        // Send [DONE] marker to properly terminate the SSE stream
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError) {
        if (abortController.signal.aborted) {
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
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ type: 'error', error: { message } })}\n\n`,
          );
          res.end();
        }
      } finally {
        clearInterval(keepaliveInterval);
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
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
      if (req?.off) {
        req.off('close', onClientDisconnect);
      }
    }
  }

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
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteMessage(
      conversationId,
      messageId,
      workspaceId,
    );
    return { message: 'Message deleted successfully' };
  }

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
  // Workspace Memory Endpoints
  // ==========================================

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
  // Skills Endpoints
  // ==========================================

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
