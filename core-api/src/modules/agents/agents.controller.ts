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
import { AgentsGraphService } from './agents.graph';
import { AgentsService } from './agents.service';
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
import { UpsertSkillDto, SkillResponseDto } from './dto/skill.dto';
import {
  CreateEmbeddingConfigDto,
  EmbeddingConfigResponseDto,
  EmbeddingProviderStatusDto,
  UpdateEmbeddingConfigDto,
  EmbeddingModelInfoDto,
} from './dto/embedding-config.dto';

@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsCompletionsService: AgentsCompletionsService,
    private readonly agentsGraphService: AgentsGraphService,
  ) {}

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
    try {
      const { stream, conversationId } =
        await this.agentsGraphService.streamMessage(
          dto,
          workspaceId,
          userId,
        );

      res.socket?.setNoDelay(true);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Content-Encoding', 'none');
      res.setHeader(
        'X-Conversation-Id',
        conversationId || dto.conversationId || '',
      );
      res.flushHeaders();

      // Headers are now committed — from this point on we can only write SSE events
      try {
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(`data: ${JSON.stringify(value)}\n\n`);
        }
        res.end();
      } catch (streamError) {
        const message =
          streamError instanceof Error ? streamError.message : 'Stream error';
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: { message } })}\n\n`,
        );
        res.end();
      }
    } catch (error) {
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

  @Post('skills')
  @Doc({
    summary: 'Upsert skill',
    description: 'Add or update a security skill using Markdown + Frontmatter',
    request: { getWorkspaceId: true },
    response: { serialization: SkillResponseDto },
  })
  async upsertSkill(
    @Body() dto: UpsertSkillDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsService.upsertSkill(workspaceId, dto);
  }

  @Get('skills')
  @Doc({
    summary: 'List skills',
    description: 'Get all security skills for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: SkillResponseDto, isArray: true },
  })
  async getSkills(
    @WorkspaceId() workspaceId: string,
  ): Promise<SkillResponseDto[]> {
    return this.agentsService.getSkills(workspaceId);
  }

  @Get('skills/:id')
  @Doc({
    summary: 'Get skill',
    description: 'Get a specific security skill by ID',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: SkillResponseDto },
  })
  async getSkill(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsService.getSkill(id, workspaceId);
  }

  @Delete('skills/:id')
  @Doc({
    summary: 'Delete skill',
    description: 'Remove a security skill',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteSkill(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteSkill(id, workspaceId);
    return { message: 'Skill deleted successfully' };
  }

  @Patch('skills/:id/toggle-status')
  @Doc({
    summary: 'Toggle skill status',
    description: 'Toggle a skill between active and inactive',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Skill ID' }],
    },
    response: { serialization: SkillResponseDto },
  })
  async toggleSkillStatus(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<SkillResponseDto> {
    return this.agentsService.toggleSkillStatus(id, workspaceId);
  }

  @Get('embedding')
  @Doc({
    summary: 'Get embedding providers status',
    request: { getWorkspaceId: true },
    response: { serialization: EmbeddingProviderStatusDto, isArray: true },
  })
  getEmbeddingProviders(
    @WorkspaceId() workspaceId: string,
  ): Promise<EmbeddingProviderStatusDto[]> {
    return this.agentsService.getEmbeddingProviders(workspaceId);
  }

  @Post('embedding')
  @Doc({
    summary: 'Add embedding provider config',
    request: { getWorkspaceId: true },
    response: { serialization: EmbeddingConfigResponseDto },
  })
  createEmbeddingConfig(
    @Body() dto: CreateEmbeddingConfigDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<EmbeddingConfigResponseDto> {
    return this.agentsService.createEmbeddingConfig(dto, workspaceId, userId);
  }

  @Patch('embedding/:id')
  @Doc({
    summary: 'Update embedding provider config',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Embedding config ID' }],
    },
    response: { serialization: EmbeddingConfigResponseDto },
  })
  updateEmbeddingConfig(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateEmbeddingConfigDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<EmbeddingConfigResponseDto> {
    return this.agentsService.updateEmbeddingConfig(id, dto, workspaceId);
  }

  @Delete('embedding/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Delete embedding provider config',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Embedding config ID' }],
    },
    response: { httpStatus: HttpStatus.NO_CONTENT },
  })
  deleteEmbeddingConfig(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    return this.agentsService.deleteEmbeddingConfig(id, workspaceId);
  }

  @Post('embedding/:id/preferred')
  @Doc({
    summary: 'Set preferred embedding config',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Embedding config ID' }],
    },
    response: { serialization: EmbeddingConfigResponseDto },
  })
  setPreferredEmbeddingConfig(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<EmbeddingConfigResponseDto> {
    return this.agentsService.setPreferredEmbeddingConfig(id, workspaceId);
  }

  @Get('embedding/:id/models')
  @Doc({
    summary: 'List models for an embedding config',
    description:
      'Get available models for a specific embedding provider configuration',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Embedding config ID' }],
    },
    response: { serialization: EmbeddingModelInfoDto, isArray: true },
  })
  async getEmbeddingProviderModels(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<EmbeddingModelInfoDto[]> {
    return this.agentsService.getEmbeddingModelsForProvider(id, workspaceId);
  }
}
