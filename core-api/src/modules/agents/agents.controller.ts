import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AgentsService } from './agents.service';
import {
  ConversationResponseDto,
  UpdateConversationDto,
} from './dto/conversation.dto';
import {
  CreateLLMConfigDto,
  LLMConfigResponseDto,
  LLMConfigWithProviderDto,
  UpdateLLMConfigDto,
} from './dto/llm-config.dto';
import { MessageResponseDto, SendMessageDto } from './dto/message.dto';

@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  // ==========================================
  // LLM Config Endpoints
  // ==========================================

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
    response: { serialization: MessageResponseDto, isArray: true },
  })
  async getMessages(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ): Promise<MessageResponseDto[]> {
    return this.agentsService.getMessages(id, workspaceId, query);
  }

  @Post('messages/stream')
  @Sse()
  @Doc({
    summary: 'Send message (streaming)',
    description:
      'Send a message and receive a streaming response via SSE. ' +
      'If conversationId is not provided, a new conversation is created using the preferred LLM config.',
    request: { getWorkspaceId: true },
  })
  async sendMessageStream(
    @Body() dto: SendMessageDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<Observable<MessageEvent>> {
    return this.agentsService.sendMessageStream(dto, workspaceId, userId);
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
}
