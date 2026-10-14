import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SearchProvider } from '../enums/agent.enums';

export const AGENT_INSTRUCTION_MAX_LENGTH = 20_000;
/** Upper bound for token limits (fits the int columns of a migration revert) */
export const AGENT_MAX_TOKENS = 10_000_000;
export const AGENT_MAX_STEPS = 1_000;

export class AgentModelRefDto {
  @ApiProperty({
    description: 'LLM connection the model runs on',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  llmConfigId: string;

  @ApiProperty({ description: 'Model identifier', example: 'gpt-5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  model: string;

  @ApiPropertyOptional({
    description: 'Context window in tokens (default 128k)',
    example: 128000,
    minimum: 1,
    maximum: AGENT_MAX_TOKENS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AGENT_MAX_TOKENS)
  contextWindow?: number;

  @ApiPropertyOptional({
    description: 'Max output tokens per response',
    example: 32768,
    minimum: 1,
    maximum: AGENT_MAX_TOKENS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AGENT_MAX_TOKENS)
  maxOutputTokens?: number;
}

export class AgentModelsConfigDto {
  @ApiPropertyOptional({
    description: 'Model for new conversations',
    type: () => AgentModelRefDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentModelRefDto)
  default?: AgentModelRefDto;

  @ApiPropertyOptional({
    description:
      'Cheap model for titles, summaries and reports (saved, not used yet)',
    type: () => AgentModelRefDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentModelRefDto)
  small?: AgentModelRefDto;

  @ApiPropertyOptional({
    description: 'Models available to subagents (saved, not used yet)',
    type: () => [AgentModelRefDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AgentModelRefDto)
  subagents?: AgentModelRefDto[];
}

export class AgentSearchProviderInputDto {
  @ApiProperty({
    description: 'Web search provider',
    enum: SearchProvider,
    example: SearchProvider.EXA,
  })
  @IsEnum(SearchProvider)
  provider: SearchProvider;

  @ApiPropertyOptional({
    description: 'Provider API key; omit to keep the saved one',
    example: 'exa-...',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Whether web search uses this provider first',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AgentSearchProviderResponseDto {
  @ApiProperty({
    description: 'Web search provider',
    enum: SearchProvider,
    example: SearchProvider.EXA,
  })
  @IsEnum(SearchProvider)
  provider: SearchProvider;

  @ApiProperty({
    description: 'Masked API key showing only its final characters',
    example: '********abcd',
  })
  @IsString()
  apiKeyMasked: string;

  @ApiProperty({
    description: 'Whether web search uses this provider first',
    example: true,
  })
  @IsBoolean()
  isDefault: boolean;
}

/** PUT body: only the fields sent change, null clears a field. */
export class UpsertAgentConfigDto {
  @ApiPropertyOptional({
    description: 'Models used by the agent; replaces the saved value',
    nullable: true,
    type: () => AgentModelsConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentModelsConfigDto)
  modelsConfig?: AgentModelsConfigDto | null;

  @ApiPropertyOptional({
    description: 'Web search providers; replaces the whole list',
    nullable: true,
    type: () => [AgentSearchProviderInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(SearchProvider).length)
  @ValidateNested({ each: true })
  @Type(() => AgentSearchProviderInputDto)
  searchProviders?: AgentSearchProviderInputDto[] | null;

  @ApiPropertyOptional({
    description: 'Custom instructions added to the system prompt',
    example: 'Always report findings in a table.',
    maxLength: AGENT_INSTRUCTION_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(AGENT_INSTRUCTION_MAX_LENGTH)
  instruction?: string | null;

  @ApiPropertyOptional({
    description: 'Max tool call steps per run (default 20)',
    example: 20,
    minimum: 1,
    maximum: AGENT_MAX_STEPS,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AGENT_MAX_STEPS)
  maxSteps?: number | null;

  @ApiPropertyOptional({
    description: 'Agent mode for new conversations',
    enum: AgentMode,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AgentMode)
  defaultAgentMode?: AgentMode | null;

  @ApiPropertyOptional({
    description: 'Approval mode for new conversations',
    enum: AgentApprovalMode,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AgentApprovalMode)
  defaultApprovalMode?: AgentApprovalMode | null;

  @ApiPropertyOptional({
    description: 'Built-in tool names the agent must not use',
    type: [String],
    example: ['execute_remote_command'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledTools?: string[];

  @ApiPropertyOptional({
    description: 'Language the agent answers in',
    example: 'vi',
    maxLength: 16,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  responseLanguage?: string | null;
}

export class AgentConfigResponseDto {
  @ApiProperty({
    description: 'Models used by the agent',
    type: () => AgentModelsConfigDto,
  })
  @ValidateNested()
  @Type(() => AgentModelsConfigDto)
  modelsConfig: AgentModelsConfigDto;

  @ApiProperty({
    description: 'Web search providers',
    type: () => [AgentSearchProviderResponseDto],
  })
  @ValidateNested({ each: true })
  @Type(() => AgentSearchProviderResponseDto)
  searchProviders: AgentSearchProviderResponseDto[];

  @ApiProperty({
    description: 'Custom instructions added to the system prompt',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  instruction: string | null;

  @ApiProperty({
    description: 'Max tool call steps per run',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  maxSteps: number | null;

  @ApiProperty({
    description: 'Agent mode for new conversations',
    enum: AgentMode,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AgentMode)
  defaultAgentMode: AgentMode | null;

  @ApiProperty({
    description: 'Approval mode for new conversations',
    enum: AgentApprovalMode,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AgentApprovalMode)
  defaultApprovalMode: AgentApprovalMode | null;

  @ApiProperty({
    description: 'Built-in tool names the agent must not use',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  disabledTools: string[];

  @ApiProperty({
    description: 'Language the agent answers in',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  responseLanguage: string | null;
}
