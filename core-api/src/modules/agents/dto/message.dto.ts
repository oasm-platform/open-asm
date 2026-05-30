import { AgentMode } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageRole, MessageType } from '../enums/agent.enums';

export class SendMessageDto {
  @ApiProperty({ example: 'Hello, how can you help me?' })
  @IsString()
  question: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
    description:
      'Continue existing conversation. If not provided, a new conversation is created.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({
    required: false,
    description: 'Override model name for new conversations',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({
    required: false,
    description: 'Override provider for new conversations',
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ enum: AgentMode, required: false })
  @IsOptional()
  @IsEnum(AgentMode)
  agentMode: AgentMode;
}

export class ToolCallResponseDto {
  @ApiProperty()
  toolCallId: string;

  @ApiProperty()
  toolName: string;

  @ApiProperty()
  args: Record<string, unknown>;

  @ApiProperty({ required: false })
  result?: Record<string, unknown> | null;

  @ApiProperty({ required: false, default: false })
  isError?: boolean;
}

export class MessageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty({ enum: MessageRole })
  role: MessageRole;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: MessageType })
  messageType: MessageType;

  @ApiProperty({ required: false })
  metadata?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      'Chronological parts array preserving the real order of reasoning, tool calls, and text.',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  parts?: Record<string, unknown>[];

  @ApiProperty({ required: false, type: [ToolCallResponseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallResponseDto)
  toolCalls?: ToolCallResponseDto[];

  @ApiProperty()
  createdAt: Date;
}

export class GetMessagesResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  messages: MessageResponseDto[];
}
