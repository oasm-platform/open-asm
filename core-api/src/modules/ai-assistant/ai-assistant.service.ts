import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import {
  AddMcpServersDto,
  AddMcpServersResponseDto,
  UpdateMcpServersDto,
  UpdateMcpServersResponseDto,
  DeleteMcpServersResponseDto,
  GetMcpServersResponseDto,
  McpConfigJson,
} from './dto/mcp-servers.dto';
import {
  DomainClassifyService,
  MCPServerService,
  ConversationService,
  MessageService,
  HealthCheckService,
  IssueService,
  LLMConfigService,
} from './ai-assistant.interface';

import { GenerateTagsDto } from './dto/generate-tags.dto';

import {
  GetConversationsResponseDto,
  UpdateConversationResponseDto,
  DeleteConversationResponseDto,
  DeleteConversationsResponseDto,
} from './dto/conversation.dto';
import {
  GetMessagesResponseDto,
  DeleteMessageResponseDto,
} from './dto/message.dto';
import { UpdateLLMConfigDto } from './dto/llm-config.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import type {
  GetMCPServerHealthResponse,
  GetConversationsResponse,
  ModelInfo,
  GetLLMConfigsResponse,
  GetMessagesResponse,
  DeleteMessageResponse,
  HealthCheckResponse,
  DomainClassifyResponse,
  AddMCPServersResponse,
  UpdateMCPServersResponse,
  DeleteMCPServersResponse,
  UpdateConversationResponse,
  DeleteConversationResponse,
  DeleteConversationsResponse,
  ResolveIssueResponse,
  UpdateLLMConfigResponse,
  DeleteLLMConfigResponse,
  SetPreferredLLMConfigRequest,
  SetPreferredLLMConfigResponse,
  GetAvailableModelsResponse,
  GetAvailableModelsRequest,
} from '@/types/assistant';

@Injectable()
export class AiAssistantService implements OnModuleInit {
  private readonly logger = new Logger(AiAssistantService.name);
  private domainClassifyService: DomainClassifyService;
  private mcpServerService: MCPServerService;
  private conversationService: ConversationService;
  private messageService: MessageService;
  private healthCheckService: HealthCheckService;
  private issueService: IssueService;
  private llmConfigService: LLMConfigService;

  constructor(
    @Inject('ASSISTANT_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.domainClassifyService =
      this.client.getService<DomainClassifyService>('DomainClassify');
    this.mcpServerService =
      this.client.getService<MCPServerService>('MCPServerService');
    this.conversationService = this.client.getService<ConversationService>(
      'ConversationService',
    );
    this.messageService =
      this.client.getService<MessageService>('MessageService');
    this.healthCheckService =
      this.client.getService<HealthCheckService>('HealthCheck');
    this.issueService = this.client.getService<IssueService>('IssueService');
    this.llmConfigService =
      this.client.getService<LLMConfigService>('LLMConfigService');
  }

  private createMetadata(workspaceId?: string, userId?: string): Metadata {
    const metadata = new Metadata();
    if (workspaceId) {
      metadata.set('x-workspace-id', workspaceId);
    }
    if (userId) {
      metadata.set('x-user-id', userId);
    }
    return metadata;
  }

  /**
   * Check health of the AI Assistant
   */
  async healthCheck(): Promise<{ message: string }> {
    try {
      const response = await firstValueFrom<HealthCheckResponse>(
        this.healthCheckService.healthCheck({}),
      );

      if (response && response.message === 'OK') {
        return {
          message: 'ok',
        };
      }

      return {
        message: 'DISABLED',
      };
    } catch {
      return {
        message: 'error',
      };
    }
  }

  /**
   * Generate tags for a domain using AI
   */
  async generateTags(
    generateTagsDto: GenerateTagsDto,
    workspaceId?: string,
    userId?: string,
  ): Promise<string[]> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<DomainClassifyResponse>(
        this.domainClassifyService.domainClassify(
          {
            domain: generateTagsDto.domain,
          },
          metadata,
        ),
      );
      return response?.labels || [];
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate tags for ${generateTagsDto.domain}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all MCP servers
   */
  async getMcpServers(
    workspaceId: string,
    userId: string,
  ): Promise<GetMcpServersResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<{ mcpConfigJson?: string }>(
        this.mcpServerService.getMcpServers({}, metadata),
      );

      // Parse JSON string from backend (already enriched with status)
      if (response && response.mcpConfigJson) {
        const parsed = JSON.parse(
          response.mcpConfigJson,
        ) as GetMcpServersResponseDto;
        return parsed;
      }

      // Fallback to empty response
      return { mcpServers: {} };
    } catch (error: unknown) {
      // Check for gRPC CANCELLED status (code 1)
      const grpcError = error as { code?: number; details?: string };
      if (grpcError?.code === 1 || grpcError?.details === 'CANCELLED') {
        this.logger.warn('MCP servers fetch cancelled by client');
        // Return empty result to avoid crashing the controller
        return { mcpServers: {} };
      }

      this.logger.error('Failed to get MCP servers', error);
      throw error;
    }
  }

  /**
   * Add MCP servers
   */
  async addMcpServers(
    addMcpServersDto: AddMcpServersDto,
    workspaceId: string,
    userId: string,
  ): Promise<AddMcpServersResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);

      const mcpConfig: McpConfigJson = {
        mcpServers: addMcpServersDto.mcpServers,
      };

      const addMcpResponse = await firstValueFrom<AddMCPServersResponse>(
        this.mcpServerService.addMcpServers(
          {
            mcpConfig,
          },
          metadata,
        ),
      );

      // Parse JSON string from backend (already enriched with status)
      if (addMcpResponse && addMcpResponse.mcpConfigJson) {
        const parsed = JSON.parse(
          addMcpResponse.mcpConfigJson,
        ) as AddMcpServersResponseDto;
        return {
          ...parsed,
          success: !!addMcpResponse.success,
          error: addMcpResponse.error,
        };
      }

      // Fallback
      return {
        mcpServers: {},
        success: !!addMcpResponse?.success,
        error: addMcpResponse?.error,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to add MCP servers', error);
      throw error;
    }
  }

  /**
   * Update MCP servers
   */
  async updateMcpServers(
    updateMcpServersDto: UpdateMcpServersDto,
    workspaceId: string,
    userId: string,
  ): Promise<UpdateMcpServersResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);

      const mcpConfig: McpConfigJson = {
        mcpServers: updateMcpServersDto.mcpServers,
      };

      const updateMcpResponse = await firstValueFrom<UpdateMCPServersResponse>(
        this.mcpServerService.updateMcpServers(
          {
            mcpConfig,
          },
          metadata,
        ),
      );

      // Parse JSON string from backend (already enriched with status)
      if (updateMcpResponse && updateMcpResponse.mcpConfigJson) {
        const parsed = JSON.parse(
          updateMcpResponse.mcpConfigJson,
        ) as UpdateMcpServersResponseDto;
        return {
          ...parsed,
          success: !!updateMcpResponse.success,
        };
      }

      return {
        mcpServers: {},
        success: !!updateMcpResponse?.success,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to update MCP servers', error);
      throw error;
    }
  }

  /**
   * Delete MCP config by ID
   */
  async deleteMcpServers(
    id: string,
    workspaceId: string,
    userId: string,
  ): Promise<DeleteMcpServersResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<DeleteMCPServersResponse>(
        this.mcpServerService.deleteMcpServers(
          {
            id,
          },
          metadata,
        ),
      );
      return {
        success: !!response.success,
        message: response.message || '',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to delete MCP config', error);
      throw error;
    }
  }

  /**
   * Get health status of a specific MCP server
   */
  async getMcpServerHealth(
    serverName: string,
    workspaceId: string,
    userId: string,
  ): Promise<{
    isActive: boolean;
    status: 'active' | 'disabled' | 'error';
    error?: string;
  }> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<GetMCPServerHealthResponse>(
        this.mcpServerService.getMcpServerHealth(
          {
            serverName,
          },
          metadata,
        ),
      );

      return {
        isActive: !!response.isActive,
        status: (response.status as 'active' | 'disabled' | 'error') || 'error',
        error: response.error || undefined,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get health for MCP server ${serverName}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all conversations for the user
   */
  async getConversations(
    workspaceId: string,
    userId: string,
    query?: GetManyBaseQueryParams,
  ): Promise<GetConversationsResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<GetConversationsResponse>(
        this.conversationService.getConversations(
          {
            search: query?.search || '',
            page: query?.page || 1,
            limit: query?.limit || 10,
            sortBy: query?.sortBy || 'updated_at',
            sortOrder: (query?.sortOrder || 'desc').toLowerCase(),
          },
          metadata,
        ),
      );
      return {
        conversations: response.conversations || [],
        totalCount: Number(response.totalCount || 0),
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get conversations',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Update a conversation
   */
  async updateConversation(
    conversationId: string,
    updateConversationDto: {
      title?: string;
      description?: string;
    },
    workspaceId: string,
    userId: string,
  ): Promise<UpdateConversationResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<UpdateConversationResponse>(
        this.conversationService.updateConversation(
          {
            conversationId,
            title: updateConversationDto.title || '',
            description: updateConversationDto.description || '',
          },
          metadata,
        ),
      );
      return {
        conversation: response?.conversation,
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to update conversation',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(
    conversationId: string,
    workspaceId: string,
    userId: string,
  ): Promise<DeleteConversationResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<DeleteConversationResponse>(
        this.conversationService.deleteConversation(
          {
            conversationId,
          },
          metadata,
        ),
      );
      return {
        success: !!response?.success,
        message: response?.message || '',
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to delete conversation',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Delete all conversations for the user
   */
  async deleteConversations(
    workspaceId: string,
    userId: string,
  ): Promise<DeleteConversationsResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<DeleteConversationsResponse>(
        this.conversationService.deleteConversations({}, metadata),
      );
      return {
        success: !!response?.success,
        message: response?.message || '',
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to delete all conversations',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Get all messages in a conversation
   */
  async getMessages(
    conversationId: string,
    workspaceId: string,
    userId: string,
  ): Promise<GetMessagesResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<GetMessagesResponse>(
        this.messageService.getMessages({ conversationId }, metadata),
      );
      return {
        messages: response.messages || [],
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get messages', error);
      throw error;
    }
  }

  /**
   * Create a message (returns Observable for SSE streaming)
   */
  createMessage(
    createMessageDto: {
      question: string;
      conversationId?: string;
      isCreateConversation?: boolean;
      agentType?: number;
      model?: string;
      provider?: string;
    },
    workspaceId: string,
    userId: string,
  ) {
    const metadata = this.createMetadata(workspaceId, userId);
    return this.messageService.createMessage(
      {
        question: createMessageDto.question,
        conversationId: createMessageDto.conversationId || '',
        isCreateConversation: createMessageDto.isCreateConversation || false,
        agentType: createMessageDto.agentType || 0,
        model: createMessageDto.model || '',
        provider: createMessageDto.provider || '',
        apiKey: '', // API key is handled by the assistant service internally
      },
      metadata,
    );
  }

  /**
   * Update a message (returns Observable for SSE streaming)
   */
  updateMessage(
    conversationId: string,
    messageId: string,
    updateMessageDto: {
      question: string;
      agentType?: number;
    },
    workspaceId: string,
    userId: string,
  ) {
    const metadata = this.createMetadata(workspaceId, userId);
    return this.messageService.updateMessage(
      {
        conversationId,
        messageId,
        question: updateMessageDto.question,
        agentType: updateMessageDto.agentType || 0,
      },
      metadata,
    );
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    workspaceId: string,
    userId: string,
  ): Promise<DeleteMessageResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom<DeleteMessageResponse>(
        this.messageService.deleteMessage(
          {
            conversationId,
            messageId,
          },
          metadata,
        ),
      );
      return {
        success: !!response.success,
        message: response.message || '',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to delete message', error);
      throw error;
    }
  }

  /**
   * Resolve issue using AI assistant
   */
  async resolveIssue(
    question: string,
    issueType: number, // IssueType enum value
    metadata: Record<string, unknown>,
    workspaceId?: string,
    userId?: string,
  ): Promise<{ message: string }> {
    try {
      const grpcMetadata = this.createMetadata(workspaceId, userId);

      const response = await firstValueFrom<ResolveIssueResponse>(
        this.issueService.resolveIssueServers(
          {
            question,
            issueType,
            metadata,
          },
          grpcMetadata,
        ),
      );

      return {
        message: response?.message || '',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to resolve issue with AI assistant', error);
      throw error;
    }
  }

  /**
   * Get LLM Configs
   */
  async getLLMConfigs(
    workspaceId: string,
    userId: string,
    query?: GetManyBaseQueryParams,
  ): Promise<GetLLMConfigsResponse> {
    const metadata = this.createMetadata(workspaceId, userId);
    const sortBy =
      query?.sortBy === 'createdAt' || !query?.sortBy
        ? 'created_at'
        : query.sortBy;
    const sortOrder = (query?.sortOrder || 'asc').toLowerCase();

    const result: GetLLMConfigsResponse = await firstValueFrom(
      this.llmConfigService.getLlmConfigs(
        {
          search: query?.search || '',
          page: query?.page || 1,
          limit: query?.limit || 10,
          sortBy,
          sortOrder,
        },
        metadata,
      ),
    );
    return result;
  }

  /**
   * Update LLM Config
   */
  async updateLLMConfig(
    dto: UpdateLLMConfigDto,
    workspaceId: string,
    userId: string,
  ): Promise<UpdateLLMConfigResponse> {
    const metadata = this.createMetadata(workspaceId, userId);
    const result: UpdateLLMConfigResponse = await firstValueFrom(
      this.llmConfigService.updateLlmConfig(
        {
          provider: dto.provider,
          apiKey: dto.apiKey,
          model: dto.model || '',
          id: dto.id || '',
          apiUrl: dto.apiUrl || '',
        },
        metadata,
      ),
    );
    return result;
  }

  /**
   * Delete LLM Config
   */
  async deleteLLMConfig(
    id: string,
    workspaceId: string,
    userId: string,
  ): Promise<DeleteLLMConfigResponse> {
    const metadata = this.createMetadata(workspaceId, userId);
    const result: DeleteLLMConfigResponse = await firstValueFrom(
      this.llmConfigService.deleteLlmConfig(
        {
          id,
        },
        metadata,
      ),
    );
    return result;
  }

  /**
   * Get available models
   */
  async getAvailableModels(
    workspaceId: string,
    userId: string,
  ): Promise<ModelInfo[]> {
    const metadata = this.createMetadata(workspaceId, userId);
    try {
      const request: GetAvailableModelsRequest = {};
      const obs = this.llmConfigService.getAvailableModels(request, metadata);
      const response: GetAvailableModelsResponse = await firstValueFrom(obs);
      return response?.models || [];
    } catch (e: unknown) {
      this.logger.warn('Failed to fetch models from assistant', e);
      return [];
    }
  }

  /**
   * Set Preferred LLM Config
   */
  async setPreferredLLMConfig(
    id: string,
    workspaceId: string,
    userId: string,
  ): Promise<SetPreferredLLMConfigResponse> {
    const metadata = this.createMetadata(workspaceId, userId);
    const request: SetPreferredLLMConfigRequest = {
      id,
    };
    const result: SetPreferredLLMConfigResponse = await firstValueFrom(
      this.llmConfigService.setPreferredLlmConfig(request, metadata),
    );
    return result;
  }
}
