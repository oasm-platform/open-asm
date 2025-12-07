import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Sse,
  Delete,
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
  DeleteConversationResponseDto,
  DeleteConversationsResponseDto,
} from './dto/conversation.dto';
import {
  GetMessagesResponseDto,
  CreateMessageDto,
  UpdateMessageDto,
  DeleteMessageResponseDto,
} from './dto/message.dto';
import { map, Observable } from 'rxjs';

@ApiTags('AI Assistant')
@Controller('ai-assistant')
@UseGuards(AssistantGuard)
export class AiAssistantController {
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
  @Delete('mcp-servers/:id')
  async deleteMcpServers(
    @Param('id') id: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteMcpServersResponseDto> {
    return this.aiAssistantService.deleteMcpServers(id, workspaceId, userId);
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
  @Patch('conversations/:id')
  async updateConversation(
    @Param('id') conversationId: string,
    @Body() updateConversationDto: UpdateConversationDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<UpdateConversationResponseDto> {
    return this.aiAssistantService.updateConversation(
      conversationId,
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
  async deleteConversation(
    @Param('id') conversationId: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteConversationResponseDto> {
    return this.aiAssistantService.deleteConversation(
      conversationId,
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
  async deleteConversations(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteConversationsResponseDto> {
    return this.aiAssistantService.deleteConversations(workspaceId, userId);
  }

  @Doc({
    summary: 'Get messages in a conversation',
    description: 'Retrieves all messages in a specific conversation',
    response: {
      serialization: GetMessagesResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<GetMessagesResponseDto> {
    return this.aiAssistantService.getMessages(
      conversationId,
      workspaceId,
      userId,
    );
  }

  @Doc({
    summary: 'Create a message with streaming response',
    description:
      'Creates a new message and streams the AI response using Server-Sent Events (SSE)',
    request: {
      getWorkspaceId: true,
    },
  })
  @Sse('messages/stream')
  createMessageStream(
    @Body() createMessageDto: CreateMessageDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Observable<{ data: string }> {
    return this.aiAssistantService
      .createMessage(createMessageDto, workspaceId, userId)
      .pipe(
        map((data) => ({
          data: JSON.stringify(data),
        })),
      );
  }

  @Doc({
    summary: 'Update a message with streaming response',
    description:
      'Updates a message and streams the regenerated AI response using Server-Sent Events (SSE)',
    request: {
      getWorkspaceId: true,
    },
  })
  @Sse('conversations/:conversationId/messages/:messageId/stream')
  updateMessageStream(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() updateMessageDto: UpdateMessageDto,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Observable<{ data: string }> {
    return this.aiAssistantService
      .updateMessage(
        conversationId,
        messageId,
        updateMessageDto,
        workspaceId,
        userId,
      )
      .pipe(
        map((data) => ({
          data: JSON.stringify(data),
        })),
      );
  }

  @Doc({
    summary: 'Delete a message',
    description: 'Deletes a specific message by ID',
    response: {
      serialization: DeleteMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Delete('conversations/:conversationId/messages/:messageId')
  async deleteMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DeleteMessageResponseDto> {
    return this.aiAssistantService.deleteMessage(
      conversationId,
      messageId,
      workspaceId,
      userId,
    );
  }
}
