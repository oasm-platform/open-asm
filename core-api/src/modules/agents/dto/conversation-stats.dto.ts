import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { SubagentStatus } from '../enums/agent.enums';

const CONTEXT_WINDOW_SOURCES = ['manual', 'catalog', 'default'] as const;

export class TurnStatsDto {
  @ApiProperty({ description: 'Model calls (steps) in the turn', example: 29 })
  @IsInt()
  steps: number;

  @ApiProperty({ description: 'Prompt tokens, incl. cached', example: 117900 })
  @IsInt()
  inputTokens: number;

  @ApiProperty({ description: 'Output tokens, incl. reasoning', example: 16500 })
  @IsInt()
  outputTokens: number;

  @ApiProperty({ description: 'Prompt tokens read from cache', example: 107300 })
  @IsInt()
  cacheReadTokens: number;

  @ApiProperty({ description: 'Prompt tokens written to cache', example: 0 })
  @IsInt()
  cacheWriteTokens: number;

  @ApiProperty({ description: 'Reasoning tokens (part of output)', example: 0 })
  @IsInt()
  reasoningTokens: number;

  @ApiProperty({ description: 'Share of prompt tokens served from cache (0-100)', example: 91 })
  @IsNumber()
  cachePercent: number;

  @ApiProperty({ description: 'Time spent waiting on the model (ms)', example: 249000 })
  @IsInt()
  modelTimeMs: number;

  @ApiProperty({ description: 'Time spent running tools, incl. approval waits (ms)', example: 79000 })
  @IsInt()
  toolTimeMs: number;

  @ApiProperty({ description: 'Average time to first token (ms)', type: Number, nullable: true, example: 850 })
  @IsOptional()
  @IsInt()
  avgTtftMs: number | null;

  @ApiProperty({ description: 'Output tokens/s while streaming', type: Number, nullable: true, example: 57 })
  @IsOptional()
  @IsNumber()
  responseTokPerSec: number | null;

  @ApiProperty({ description: 'Output tokens/s over the whole turn', type: Number, nullable: true, example: 66 })
  @IsOptional()
  @IsNumber()
  turnTokPerSec: number | null;

  @ApiProperty({ description: 'Turn wall time, excluding subagent waits (ms)', example: 328000 })
  @IsInt()
  wallTimeMs: number;

  @ApiProperty({ description: 'Time spent waiting for background subagents (ms)', example: 0 })
  @IsInt()
  subagentWaitMs: number;

  @ApiProperty({ description: 'Cost in USD; null when the model price is unknown', type: Number, nullable: true, example: 0.0123 })
  @IsOptional()
  @IsNumber()
  costUsd: number | null;
}

export class ConversationTotalsDto {
  @ApiProperty({ example: 250000 })
  @IsInt()
  inputTokens: number;

  @ApiProperty({ example: 30000 })
  @IsInt()
  outputTokens: number;

  @ApiProperty({ description: 'USD of all priced turns and subagent runs', example: 0.42 })
  @IsNumber()
  costUsd: number;

  @ApiProperty({ description: 'False when some turn used a model with no known price' })
  @IsBoolean()
  costComplete: boolean;

  @ApiProperty({ description: 'Completed user turns', example: 4 })
  @IsInt()
  turns: number;
}

export class ConversationMetadataDto {
  @ApiPropertyOptional({ description: 'Model of the latest turn', example: 'claude-sonnet-4-5' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Provider of the latest turn', example: 'anthropic' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'LLM connection of the latest turn' })
  @IsOptional()
  @IsUUID()
  llmConfigId?: string;

  @ApiPropertyOptional({ description: 'Context window of the model (tokens)', example: 200000 })
  @IsOptional()
  @IsInt()
  contextWindow?: number;

  @ApiPropertyOptional({
    description: 'manual = model setting, catalog = models.dev, default = 128k fallback',
    enum: CONTEXT_WINDOW_SOURCES,
  })
  @IsOptional()
  @IsIn(CONTEXT_WINDOW_SOURCES)
  contextWindowSource?: (typeof CONTEXT_WINDOW_SOURCES)[number];

  @ApiPropertyOptional({ description: 'True when the window is a guess (default, or models.dev match by bare model id)' })
  @IsOptional()
  @IsBoolean()
  catalogEstimated?: boolean;

  @ApiPropertyOptional({ description: 'Tokens in the context after the latest step', example: 48210 })
  @IsOptional()
  @IsInt()
  contextUsedTokens?: number;

  @ApiPropertyOptional({ type: TurnStatsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TurnStatsDto)
  lastTurn?: TurnStatsDto;

  @ApiPropertyOptional({ type: ConversationTotalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationTotalsDto)
  totals?: ConversationTotalsDto;

  @ApiPropertyOptional({ description: 'ISO time of the last metadata update' })
  @IsOptional()
  @IsString()
  updatedAt?: string;
}

export class SubagentResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'Subagent key', example: 'researcher' })
  @IsString()
  name: string;

  @ApiProperty({ enum: SubagentStatus, example: SubagentStatus.PENDING })
  @IsEnum(SubagentStatus)
  status: SubagentStatus;

  @ApiProperty({ description: 'Task dispatched by the main agent' })
  @IsString()
  task: string;

  @ApiProperty({ description: 'Final summary of the subagent', type: String, nullable: true })
  @IsOptional()
  @IsString()
  result: string | null;

  @ApiProperty({ description: 'Failure reason', type: String, nullable: true })
  @IsOptional()
  @IsString()
  error: string | null;

  @ApiProperty()
  @IsDate()
  createdAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  @IsOptional()
  @IsDate()
  startedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  @IsOptional()
  @IsDate()
  completedAt: Date | null;

  @ApiProperty({ description: 'When the main agent received the result', type: Date, nullable: true })
  @IsOptional()
  @IsDate()
  deliveredAt: Date | null;

  @ApiProperty({ example: 0 })
  @IsInt()
  sortOrder: number;

  @ApiProperty({ type: TurnStatsDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => TurnStatsDto)
  stats: TurnStatsDto | null;
}
