import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import type { Conversation } from '@/types/assistant';

/**
 * Get Conversations
 */
export class GetConversationsResponseDto {
  @ApiProperty({
    description: 'List of conversations',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
  })
  conversations: Conversation[];
}

/**
 * Update Conversation
 */
export class UpdateConversationDto {
  @ApiPropertyOptional({
    description: 'New title for the conversation',
    example: 'Updated Conversation Title',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'New description for the conversation',
    example: 'Updated description',
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateConversationResponseDto {
  @ApiProperty({
    description: 'Updated conversation',
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
    },
  })
  conversation: Conversation;
}

/**
 * Delete Conversation
 */
export class DeleteConversationDto {
  @ApiProperty({
    description: 'Conversation ID to delete',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}

export class DeleteConversationResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Conversation deleted successfully',
  })
  message: string;
}

/**
 * Delete All Conversations
 */
export class DeleteConversationsResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'All conversations deleted successfully',
  })
  message: string;
}
