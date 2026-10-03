import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LLMProvider, MessageRole, MessageType } from '../enums/agent.enums';

export class SendMessageDto {
  @ApiProperty({
    description: 'User message to send to the agent',
    example: 'Hello, how can you help me?',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'question must contain a non-whitespace character' })
  question: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'Continue existing conversation. If not provided, a new conversation is created.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Override model name for new conversations',
    example: 'gpt-5',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @ApiPropertyOptional({
    description: 'Override provider for new conversations',
    enum: LLMProvider,
    example: LLMProvider.OPENAI,
  })
  @IsOptional()
  @IsEnum(LLMProvider)
  provider?: LLMProvider;

  @ApiPropertyOptional({
    description: 'Interaction mode for a new or existing conversation',
    enum: AgentMode,
    example: AgentMode.ASK,
  })
  @IsOptional()
  @IsEnum(AgentMode)
  agentMode?: AgentMode;

  @ApiPropertyOptional({
    enum: AgentApprovalMode,
    description: 'Approval policy for agent tool requests',
    example: AgentApprovalMode.MANUAL,
  })
  @IsOptional()
  @IsEnum(AgentApprovalMode)
  approvalMode?: AgentApprovalMode;

  @ApiPropertyOptional({
    description:
      'Preferred worker for remote execution when agent mode is selected',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  workerId?: string;
}

export class ToolCallResponseDto {
  @ApiProperty({
    description: 'Identifier assigned to this tool invocation',
    example: 'call_123',
  })
  @IsString()
  @IsNotEmpty()
  toolCallId: string;

  @ApiProperty({
    description: 'Registered name of the invoked tool',
    example: 'execute_command',
  })
  @IsString()
  @IsNotEmpty()
  toolName: string;

  @ApiProperty({
    description: 'Arguments supplied to the tool invocation',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  args: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Structured result returned by the tool, when available',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Whether the tool invocation finished with an error',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isError?: boolean;
}

export class MessageResponseDto {
  @ApiProperty({
    description: 'Unique message identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Conversation containing this message',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  conversationId: string;

  @ApiProperty({
    description: 'Participant that produced the message',
    enum: MessageRole,
    example: MessageRole.ASSISTANT,
  })
  @IsEnum(MessageRole)
  role: MessageRole;

  @ApiProperty({
    description: 'Plain-text message content',
    example: 'I found three relevant assets.',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Rendering category of the message',
    enum: MessageType,
    example: MessageType.TEXT,
  })
  @IsEnum(MessageType)
  messageType: MessageType;

  @ApiPropertyOptional({
    description: 'Additional structured message metadata',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Chronological parts array preserving the real order of reasoning, tool calls, and text.',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  parts?: Record<string, unknown>[];

  @ApiPropertyOptional({
    description: 'Tool invocations associated with this message',
    type: [ToolCallResponseDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallResponseDto)
  toolCalls?: ToolCallResponseDto[];

  @ApiProperty({
    description: 'Timestamp when the message was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  createdAt: Date;
}

export class GetMessagesResponseDto {
  @ApiProperty({
    description: 'Messages in chronological conversation order',
    type: [MessageResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageResponseDto)
  messages: MessageResponseDto[];
}
