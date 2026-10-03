import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AgentTodoItemDto {
  @ApiProperty({
    description: 'Unique identifier of the plan item',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Action described by this plan item',
    example: 'Inspect the target configuration',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Current execution status of the plan item',
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    example: 'pending',
  })
  @IsIn(['pending', 'in_progress', 'completed', 'failed'])
  status: 'pending' | 'in_progress' | 'completed' | 'failed';

  @ApiProperty({
    description: 'Zero-based display order of the plan item',
    example: 0,
  })
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiProperty({
    description: 'ISO timestamp of the most recent plan item update',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDateString()
  updatedAt: string;
}

export class CreateConversationDto {
  @ApiProperty({
    description: 'LLM configuration used by the conversation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  llmConfigId: string;

  @ApiPropertyOptional({
    description: 'Optional conversation title',
    example: 'My conversation',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

export class UpdateConversationDto {
  @ApiPropertyOptional({
    description: 'Replacement conversation title',
    example: 'Updated title',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

export class ConversationResponseDto {
  @ApiProperty({
    description: 'Unique conversation identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'LLM configuration used by the conversation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  llmConfigId: string;

  @ApiPropertyOptional({
    description: 'Conversation title',
    example: 'My conversation',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string | null;

  @ApiProperty({
    description: 'Interaction mode used by the conversation',
    enum: AgentMode,
    example: AgentMode.ASK,
  })
  @IsEnum(AgentMode)
  agentMode: AgentMode;

  @ApiProperty({
    description: 'Approval policy used for agent tool requests',
    enum: AgentApprovalMode,
    example: AgentApprovalMode.MANUAL,
  })
  @IsEnum(AgentApprovalMode)
  approvalMode: AgentApprovalMode;

  @ApiProperty({
    description: 'Timestamp when the conversation was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the conversation was last updated',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Ordered execution plan for the agent',
    type: [AgentTodoItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentTodoItemDto)
  todos?: AgentTodoItemDto[];

  @ApiPropertyOptional({
    description: 'Summarized context of previous conversation turns',
  })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({
    description: 'Worker currently assigned to remote tool execution',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  workerId?: string;
}

export class GetConversationsResponseDto {
  @ApiProperty({
    description: 'Conversations visible to the current user',
    type: [ConversationResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationResponseDto)
  conversations: ConversationResponseDto[];

  @ApiProperty({
    description: 'Total number of conversations matching the query',
    example: 12,
  })
  @IsInt()
  @Min(0)
  totalCount: number;
}
