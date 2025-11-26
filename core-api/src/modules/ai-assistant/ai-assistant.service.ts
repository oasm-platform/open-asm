import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import {
  AddMcpServersDto,
  AddMcpServersResponseDto,
  McpServerConfig,
} from './dto/add-mcp-servers.dto';
import { McpServerConfigWithStatus } from './dto/get-mcp-servers.dto';
import {
  DomainClassifyService,
  MCPServerService,
  ConversationService,
  MessageService,
} from './ai-assistant.interface';
import { Struct } from '@/types';
import { GenerateTagsDto } from './dto/generate-tags.dto';
import {
  UpdateMcpServersDto,
  UpdateMcpServersResponseDto,
} from './dto/update-mcp-servers.dto';
import {
  DeleteMcpServersDto,
  DeleteMcpServersResponseDto,
} from './dto/delete-mcp-servers.dto';
import { GetMcpServersResponseDto } from './dto/get-mcp-servers.dto';

@Injectable()
export class AiAssistantService implements OnModuleInit {
  private readonly logger = new Logger(AiAssistantService.name);
  private domainClassifyService: DomainClassifyService;
  private mcpServerService: MCPServerService;
  private conversationService: ConversationService;
  private messageService: MessageService;

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
        mcpServers: mcpServers as Record<
          string,
          McpServerConfigWithStatus
        >,
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
        mcpServers: mcpServers as Record<
          string,
          McpServerConfigWithStatus
        >,
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
    deleteMcpServersDto: DeleteMcpServersDto,
    workspaceId: string,
    userId: string,
  ): Promise<DeleteMcpServersResponseDto> {
    try {
      const metadata = this.createMetadata(workspaceId, userId);
      const response = await firstValueFrom(
        this.mcpServerService.deleteMcpServers(
          {
            id: deleteMcpServersDto.id,
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
}
