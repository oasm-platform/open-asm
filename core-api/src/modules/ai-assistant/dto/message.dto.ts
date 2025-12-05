import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import type { Message, Conversation } from '@/types/assistant';

/**
 * Get Messages
 */
export class GetMessagesDto {
  @ApiProperty({
    description: 'Conversation ID to get messages from',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}

export class GetMessagesResponseDto {
  @ApiProperty({
    description: 'List of messages in the conversation',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        messageId: { type: 'string' },
        question: { type: 'string' },
        type: { type: 'string' },
        content: { type: 'string' },
        conversationId: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
  })
  messages: Message[];
}

/**
 * Create Message (with SSE streaming)
 */
export class CreateMessageDto {
  @ApiProperty({
    description: 'Question/prompt to send',
    example: 'What is the security status of my system?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({
    description: 'Conversation ID (if continuing existing conversation)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Whether to create a new conversation',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isCreateConversation?: boolean;
}

export class CreateMessageResponseDto {
  @ApiPropertyOptional({
    description: 'Created message',
  })
  message?: Message;

  @ApiPropertyOptional({
    description: 'Conversation (if new conversation was created)',
  })
  conversation?: Conversation;
}

/**
 * Update Message
 */
export class UpdateMessageDto {
  @ApiProperty({
    description: 'Updated question/prompt',
    example: 'What is the security status of my system?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;
}

export class UpdateMessageResponseDto {
  @ApiProperty({
    description: 'Updated message',
  })
  message: Message;
}

/**
 * Delete Message
 */
export class DeleteMessageDto {
  @ApiProperty({
    description: 'Conversation ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @ApiProperty({
    description: 'Message ID to delete',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  messageId: string;
}

export class DeleteMessageResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Message deleted successfully',
  })
  message: string;
}
