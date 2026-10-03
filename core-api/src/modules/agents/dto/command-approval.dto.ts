import {
  GetManyBaseQueryParams,
  SortOrder,
} from '@/common/dtos/get-many-base.dto';
import {
  AgentApprovalMode,
  AgentCommandApprovalStatus,
} from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Longest command stored or returned. Tool inputs can be megabytes; the hash
 * still covers all of it, so a preview never weakens the match.
 */
export const COMMAND_PREVIEW_LENGTH = 2000;

/** `command` cut to COMMAND_PREVIEW_LENGTH, ending in `…` when cut. */
export function previewCommand(command: string): string {
  return command.length > COMMAND_PREVIEW_LENGTH
    ? `${command.slice(0, COMMAND_PREVIEW_LENGTH)}…`
    : command;
}

export const COMMAND_APPROVAL_SORT_FIELDS = ['updatedAt', 'createdAt'] as const;
export type CommandApprovalSortField =
  (typeof COMMAND_APPROVAL_SORT_FIELDS)[number];

export class GetCommandApprovalsQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional({
    enum: AgentCommandApprovalStatus,
    description: 'Only return approvals in this status',
  })
  @IsOptional()
  @IsEnum(AgentCommandApprovalStatus)
  status?: AgentCommandApprovalStatus;

  @ApiPropertyOptional({
    enum: COMMAND_APPROVAL_SORT_FIELDS,
    example: 'updatedAt',
  })
  @IsOptional()
  @IsIn(COMMAND_APPROVAL_SORT_FIELDS)
  sortBy: CommandApprovalSortField = 'updatedAt';

  @ApiPropertyOptional({ enum: SortOrder, example: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}

export class CommandApprovalResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  conversationId?: string | null;

  @ApiProperty({ required: false, nullable: true, type: String })
  toolCallId?: string | null;

  @ApiProperty({
    description: `The command, cut to ${COMMAND_PREVIEW_LENGTH} characters (ending in …)`,
  })
  command: string;

  @ApiProperty({ description: 'Whether `command` was cut short' })
  commandTruncated: boolean;

  @ApiProperty({ enum: AgentCommandApprovalStatus })
  status: AgentCommandApprovalStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class DecideCommandApprovalDto {
  @ApiProperty({
    description: 'Decision for the pending tool execution request',
    enum: [
      AgentCommandApprovalStatus.APPROVED,
      AgentCommandApprovalStatus.REJECTED,
    ],
    example: AgentCommandApprovalStatus.APPROVED,
  })
  @IsIn([
    AgentCommandApprovalStatus.APPROVED,
    AgentCommandApprovalStatus.REJECTED,
  ])
  status:
    AgentCommandApprovalStatus.APPROVED | AgentCommandApprovalStatus.REJECTED;

  @ApiPropertyOptional({
    description:
      'Whether all later tool requests in this conversation should also be approved',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowConversation?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether later calls of the same tool in this conversation should also be approved, whatever their input',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowTool?: boolean;

  @ApiPropertyOptional({
    description: 'Feedback describing what the agent should do after rejection',
    example: 'Use the read-only command instead.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}

export class DecidePlanApprovalDto {
  @ApiProperty({
    description: 'Decision for the proposed agent plan',
    enum: [
      AgentCommandApprovalStatus.APPROVED,
      AgentCommandApprovalStatus.REJECTED,
    ],
    example: AgentCommandApprovalStatus.APPROVED,
  })
  @IsIn([
    AgentCommandApprovalStatus.APPROVED,
    AgentCommandApprovalStatus.REJECTED,
  ])
  status:
    AgentCommandApprovalStatus.APPROVED | AgentCommandApprovalStatus.REJECTED;

  @ApiPropertyOptional({
    enum: [AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL],
    description:
      'How an approved plan runs: automatically or with approval for each tool request',
    example: AgentApprovalMode.MANUAL,
  })
  @IsOptional()
  @IsIn([AgentApprovalMode.AUTO, AgentApprovalMode.MANUAL])
  mode?: AgentApprovalMode.AUTO | AgentApprovalMode.MANUAL;

  @ApiPropertyOptional({
    description: 'Feedback describing how the agent should revise a rejected plan',
    example: 'Remove the destructive step and propose the plan again.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}
