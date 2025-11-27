import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiAssistantService } from './ai-assistant.service';
import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { AssistantGuard } from '@/common/guards/assistant.guard';
import { Doc } from '@/common/doc/doc.decorator';
import {
  AddMcpServersDto,
  AddMcpServersResponseDto,
  UpdateMcpServersDto,
  UpdateMcpServersResponseDto,
  DeleteMcpServersDto,
  DeleteMcpServersResponseDto,
} from './dto/mcp-servers.dto';
import {
  GenerateTagsDto,
  GenerateTagsResponseDto,
} from './dto/generate-tags.dto';
import {
  GetConversationsResponseDto,
  UpdateConversationDto,
  UpdateConversationResponseDto,
  DeleteConversationDto,
  DeleteConversationResponseDto,
  DeleteConversationsResponseDto,
} from './dto/conversation.dto';

@ApiTags('AI Assistant')
@Controller('ai-assistant')
export class AiAssistantController {
  private readonly logger = new Logger(AiAssistantController.name);

  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Doc({
    summary: 'Generate tags for a domain using AI',
    description:
      'Analyzes a domain and generates relevant tags using AI classification. Requires AI Assistant tool to be installed in the workspace.',
    response: {
      serialization: GenerateTagsResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('generate-tags')
  @UseGuards(AssistantGuard)
  async generateTags(
    @Body() generateTagsDto: GenerateTagsDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<GenerateTagsResponseDto> {
    const tags = await this.aiAssistantService.generateTags(
      generateTagsDto,
      workspaceId,
      userId,
    );
    return {
      domain: generateTagsDto.domain,
      tags,
    };
  }

  @Doc({
    summary: 'Get all MCP servers',
    description: 'Retrieves all MCP servers for the current workspace and user',
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('mcp-servers')
  @UseGuards(AssistantGuard)
  async getMcpServers(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.aiAssistantService.getMcpServers(workspaceId, userId);
  }

  @Doc({
    summary: 'Add MCP servers',
    description: 'Adds one or more MCP servers to the workspace',
    response: {
      serialization: AddMcpServersResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('mcp-servers')
  @UseGuards(AssistantGuard)
  async addMcpServers(
    @Body() addMcpServersDto: AddMcpServersDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<AddMcpServersResponseDto> {
    return this.aiAssistantService.addMcpServers(
      addMcpServersDto,
      workspaceId,
      userId,
    );
  }

  @Doc({
    summary: 'Update MCP servers',
    description: 'Updates one or more MCP servers',
    response: {
      serialization: UpdateMcpServersResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Patch('mcp-servers')
  @UseGuards(AssistantGuard)
  async updateMcpServers(
    @Body() updateMcpServersDto: UpdateMcpServersDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<UpdateMcpServersResponseDto> {
    return this.aiAssistantService.updateMcpServers(
      updateMcpServersDto,
      workspaceId,
      userId,
    );
  }

  @Doc({
    summary: 'Delete MCP config',
    description: 'Deletes MCP config by ID',
    response: {
      serialization: DeleteMcpServersResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Delete('mcp-servers')
  @UseGuards(AssistantGuard)
  async deleteMcpServers(
    @Body() deleteMcpServersDto: DeleteMcpServersDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteMcpServersResponseDto> {
    return this.aiAssistantService.deleteMcpServers(
      deleteMcpServersDto,
      workspaceId,
      userId,
    );
  }

  @Doc({
    summary: 'Get all conversations',
    description:
      'Retrieves all conversations for the current workspace and user',
    response: {
      serialization: GetConversationsResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('conversations')
  @UseGuards(AssistantGuard)
  async getConversations(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<GetConversationsResponseDto> {
    return this.aiAssistantService.getConversations(workspaceId, userId);
  }

  @Doc({
    summary: 'Update a conversation',
    description: 'Updates the title and/or description of a conversation',
    response: {
      serialization: UpdateConversationResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Patch('conversations')
  @UseGuards(AssistantGuard)
  async updateConversation(
    @Body() updateConversationDto: UpdateConversationDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<UpdateConversationResponseDto> {
    return this.aiAssistantService.updateConversation(
      updateConversationDto,
      workspaceId,
      userId,
    );
  }

  @Doc({
    summary: 'Delete a conversation',
    description: 'Deletes a specific conversation by ID',
    response: {
      serialization: DeleteConversationResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Delete('conversations/:id')
  @UseGuards(AssistantGuard)
  async deleteConversation(
    @Body() deleteConversationDto: DeleteConversationDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteConversationResponseDto> {
    return this.aiAssistantService.deleteConversation(
      deleteConversationDto,
      workspaceId,
      userId,
    );
  }

  @Doc({
    summary: 'Delete all conversations',
    description: 'Deletes all conversations for the current workspace and user',
    response: {
      serialization: DeleteConversationsResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Delete('conversations')
  @UseGuards(AssistantGuard)
  async deleteConversations(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteConversationsResponseDto> {
    return this.aiAssistantService.deleteConversations(workspaceId, userId);
  }
}
