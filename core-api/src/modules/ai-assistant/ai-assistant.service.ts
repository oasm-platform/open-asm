import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import {
  AddMcpServersDto,
  AddMcpServersResponseDto,
  McpServerConfig,
  UpdateMcpServersDto,
  UpdateMcpServersResponseDto,
  DeleteMcpServersResponseDto,
  GetMcpServersResponseDto,
  McpServerConfigWithStatus,
} from './dto/mcp-servers.dto';
import {
  DomainClassifyService,
  MCPServerService,
  ConversationService,
  MessageService,
  HealthCheckService,
  IssueService,
} from './ai-assistant.interface';

import { Struct } from '@/types';
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
import type { GetMCPServerHealthResponse } from '@/types/assistant';

@Injectable()
export class AiAssistantService implements OnModuleInit {
  private readonly logger = new Logger(AiAssistantService.name);
  private domainClassifyService: DomainClassifyService;
  private mcpServerService: MCPServerService;
  private conversationService: ConversationService;
  private messageService: MessageService;
  private healthCheckService: HealthCheckService;
  private issueService: IssueService;

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
      const response = await firstValueFrom(
        this.healthCheckService.healthCheck({}),
      );

      if (response.message === 'OK') {
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
      const response = await firstValueFrom(
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
      const response = await firstValueFrom(
        this.mcpServerService.getMcpServers({}, metadata),
      );

      // Parse JSON string from backend (already enriched with status)
      if (response.mcpConfigJson) {
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

      // Wrap the entire config object (including mcpServers key)
      const mcpConfigStruct = Struct.wrap({
        mcpServers: addMcpServersDto.mcpServers,
      });

      const response = await firstValueFrom(
        this.mcpServerService.addMcpServers(
          {
            mcpConfig: mcpConfigStruct,
          },
          metadata,
        ),
      );

      // Parse JSON string from backend (already enriched with status)
      if (response.mcpConfigJson) {
        const parsed = JSON.parse(
          response.mcpConfigJson,
        ) as AddMcpServersResponseDto;
        return {
          ...parsed,
          success: response.success || false,
          error: response.error,
        };
      }

      // Fallback to old response format (should not happen with updated backend)
      const mcpServers: Record<string, McpServerConfig> = {};
      for (const server of response.servers || []) {
        if (server.config) {
          const structLike = server.config as {
            fields: Record<string, unknown>;
          };
          const unwrapped = Struct.unwrap(structLike);
          Object.assign(mcpServers, unwrapped);
        }
      }

      return {
        mcpServers: mcpServers as Record<string, McpServerConfigWithStatus>,
        success: response.success || false,
        error: response.error,
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

      // Wrap the entire config object (including mcpServers key)
      const mcpConfigStruct = Struct.wrap({
        mcpServers: updateMcpServersDto.mcpServers,
      });

      const response = await firstValueFrom(
        this.mcpServerService.updateMcpServers(
          {
            mcpConfig: mcpConfigStruct,
          },
          metadata,
        ),
      );

      // Parse JSON string from backend (already enriched with status)
      if (response.mcpConfigJson) {
        const parsed = JSON.parse(
          response.mcpConfigJson,
        ) as UpdateMcpServersResponseDto;
        return {
          ...parsed,
          success: response.success || false,
        };
      }

      // Fallback to old response format (should not happen with updated backend)
      const mcpServers: Record<string, McpServerConfig> = {};
      for (const server of response.servers || []) {
        if (server.config) {
          const structLike = server.config as {
            fields: Record<string, unknown>;
          };
          const unwrapped = Struct.unwrap(structLike);
          Object.assign(mcpServers, unwrapped);
        }
      }

      return {
        mcpServers: mcpServers as Record<string, McpServerConfigWithStatus>,
        success: response.success || false,
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
      const response = await firstValueFrom(
        this.mcpServerService.deleteMcpServers(
          {
            id,
          },
          metadata,
        ),
      );
      return {
        success: response.success || false,
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
      const response: GetMCPServerHealthResponse = await firstValueFrom(
        this.mcpServerService.getMcpServerHealth(
          {
            serverName,
          },
          metadata,
        ),
      );

      return {
        isActive: response.isActive || false,
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
  ): Promise<GetConversationsResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom(
        this.conversationService.getConversations({}, metadata),
      );
      return {
        conversations: response.conversations || [],
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get conversations', error);
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
      const response = await firstValueFrom(
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
        conversation: response.conversation!,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to update conversation', error);
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
      const response = await firstValueFrom(
        this.conversationService.deleteConversation(
          {
            conversationId,
          },
          metadata,
        ),
      );
      return {
        success: response.success || false,
        message: response.message || '',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to delete conversation', error);
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
      const response = await firstValueFrom(
        this.conversationService.deleteConversations({}, metadata),
      );
      return {
        success: response.success || false,
        message: response.message || '',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to delete all conversations', error);
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
      const response = await firstValueFrom(
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
      const response = await firstValueFrom(
        this.messageService.deleteMessage(
          {
            conversationId,
            messageId,
          },
          metadata,
        ),
      );
      return {
        success: response.success || false,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: Record<string, any>,
    workspaceId?: string,
    userId?: string,
  ): Promise<{ message: string }> {
    try {
      const grpcMetadata = this.createMetadata(workspaceId, userId);

      const response = await firstValueFrom(
        this.issueService.resolveIssueServers(
          {
            question,
            issueType,
            metadata: metadata,
          },
          grpcMetadata,
        ),
      );

      return {
        message: response.message || '',
      };
    } catch (error: unknown) {
      this.logger.error('Failed to resolve issue with AI assistant', error);
      throw error;
    }
  }
}
