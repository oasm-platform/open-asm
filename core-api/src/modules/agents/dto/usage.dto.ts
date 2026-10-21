import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsTimeZone, Max, Min } from 'class-validator';

export const USAGE_MAX_DAYS = 90;

export class GetAgentUsageQueryDto {
  @ApiPropertyOptional({
    description: 'Days to include, today included',
    example: 30,
    minimum: 1,
    maximum: USAGE_MAX_DAYS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USAGE_MAX_DAYS)
  days: number = 30;

  @ApiPropertyOptional({
    description: 'IANA time zone the days are counted in',
    example: 'Asia/Ho_Chi_Minh',
  })
  @IsOptional()
  @IsTimeZone()
  tz: string = 'UTC';
}

export class UsageTotalsDto {
  @ApiProperty({ description: 'Model calls (steps)', example: 120 })
  requests: number;

  @ApiProperty({ description: 'Prompt tokens, incl. cached', example: 950000 })
  inputTokens: number;

  @ApiProperty({ description: 'Output tokens, incl. reasoning', example: 42000 })
  outputTokens: number;

  @ApiProperty({ description: 'Prompt tokens read from cache', example: 800000 })
  cacheReadTokens: number;

  @ApiProperty({ description: 'USD of all priced calls', example: 1.25 })
  costUsd: number;

  @ApiProperty({
    description: 'False when some call used a model with no known price',
  })
  costComplete: boolean;
}

export class UsageSummaryDto extends UsageTotalsDto {
  @ApiProperty({ description: 'Conversations with usage in the range' })
  sessions: number;

  @ApiProperty({ description: 'Main agent answers' })
  responses: number;

  @ApiProperty({ description: 'Completed background subagent runs' })
  subagentRuns: number;
}

export class UsageDayDto extends UsageTotalsDto {
  @ApiProperty({ description: 'Day in the requested time zone', example: '2026-10-20' })
  date: string;
}

export class UsageModelDto extends UsageTotalsDto {
  @ApiProperty({ example: 'claude-sonnet-4-5' })
  model: string;

  @ApiProperty({ type: String, nullable: true, example: 'anthropic' })
  provider: string | null;
}

export class UsageSessionDto extends UsageTotalsDto {
  @ApiProperty({ description: 'Conversation ID' })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ description: 'Latest usage of the conversation in the range' })
  lastActiveAt: Date;
}

export class AgentUsageResponseDto {
  @ApiProperty({ example: 30 })
  days: number;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  tz: string;

  @ApiProperty({ type: UsageSummaryDto })
  summary: UsageSummaryDto;

  @ApiProperty({ type: [UsageDayDto], description: 'One entry per day, oldest first' })
  daily: UsageDayDto[];

  @ApiProperty({ type: [UsageModelDto], description: 'Most tokens first' })
  models: UsageModelDto[];

  @ApiProperty({
    type: [UsageSessionDto],
    description: 'Conversations with the most tokens, at most 10',
  })
  sessions: UsageSessionDto[];
}
