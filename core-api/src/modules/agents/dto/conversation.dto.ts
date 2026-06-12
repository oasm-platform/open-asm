import { AgentMode } from '@/common/enums/enum';
import type { AgentTodoItem } from '../agents.todo';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  llmConfigId: string;

  @ApiProperty({ example: 'My conversation', required: false })
  @IsOptional()
  @IsString()
  title?: string;
}

export class UpdateConversationDto {
  @ApiProperty({ example: 'Updated title', required: false })
  @IsOptional()
  @IsString()
  title?: string;
}

export class ConversationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  llmConfigId: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ enum: AgentMode, example: AgentMode.ASK })
  @IsEnum(AgentMode)
  agentMode: AgentMode;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    description: 'Agent execution plan (todo list)',
    required: false,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  todos?: AgentTodoItem[];

  @ApiProperty({
    description: 'Summarized context of previous conversation turns',
    required: false,
  })
  @IsOptional()
  @IsString()
  summary?: string;
}

export class GetConversationsResponseDto {
  @ApiProperty({ type: [ConversationResponseDto] })
  conversations: ConversationResponseDto[];

  @ApiProperty()
  totalCount: number;
}
