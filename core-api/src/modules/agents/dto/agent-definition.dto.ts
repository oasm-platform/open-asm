import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AgentDefinitionMode,
  AgentDefinitionScope,
} from '../enums/agent.enums';
import { AGENT_INSTRUCTION_MAX_LENGTH, AGENT_MAX_STEPS } from './agent-config.dto';

/** Lowercase words joined by single dashes, e.g. "finding-retest" */
export const AGENT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const AGENT_NAME_MAX_LENGTH = 64;
const LIST_MAX = 200;

const CUSTOM_SCOPES = [AgentDefinitionScope.USER, AgentDefinitionScope.WORKSPACE] as const;
type CustomScope = (typeof CUSTOM_SCOPES)[number];

export class AgentDefinitionModelDto {
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
}

export class AgentDefinitionMetadataDto {
  @ApiPropertyOptional({
    description: "Override model; unset uses the user's default model",
    type: AgentDefinitionModelDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentDefinitionModelDto)
  model?: AgentDefinitionModelDto;

  @ApiPropertyOptional({
    description: 'Provider thinking variant; unset uses the default',
    example: 'high',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  variant?: string;

  @ApiPropertyOptional({ description: 'Sampling temperature', minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Nucleus sampling', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({
    description: 'Max tool call steps per run',
    minimum: 1,
    maximum: AGENT_MAX_STEPS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(AGENT_MAX_STEPS)
  maxSteps?: number;

  @ApiPropertyOptional({
    description: 'Tool allowlist; unset gives every tool of the mode',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX)
  @IsString({ each: true })
  tools?: string[];

  @ApiPropertyOptional({ description: 'Skill names the agent can load', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX)
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'MCP server names the agent can use', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX)
  @IsString({ each: true })
  mcpServers?: string[];
}

export class CreateAgentDefinitionDto {
  @ApiProperty({
    description: 'Slug mentioned as @name; unique for the user in the workspace',
    example: 'finding-retest',
    maxLength: AGENT_NAME_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(AGENT_NAME_MAX_LENGTH)
  @Matches(AGENT_NAME_PATTERN, {
    message: 'name must be a lowercase slug (a-z, 0-9 and single dashes)',
  })
  name: string;

  @ApiPropertyOptional({ description: 'Display name', example: 'Finding retest' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'What the agent does', example: 'Retests a finding' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @ApiProperty({ enum: AgentDefinitionMode, default: AgentDefinitionMode.ALL })
  @IsEnum(AgentDefinitionMode)
  mode: AgentDefinitionMode;

  @ApiProperty({
    description: 'user: only you see it; workspace: every workspace member does',
    enum: CUSTOM_SCOPES,
    default: AgentDefinitionScope.USER,
  })
  @IsIn(CUSTOM_SCOPES)
  scope: CustomScope;

  @ApiPropertyOptional({ description: 'System prompt of the agent' })
  @IsOptional()
  @IsString()
  @MaxLength(AGENT_INSTRUCTION_MAX_LENGTH)
  systemPrompt?: string;

  @ApiPropertyOptional({ type: AgentDefinitionMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentDefinitionMetadataDto)
  metadata?: AgentDefinitionMetadataDto;
}

export class UpdateAgentDefinitionDto {
  @ApiPropertyOptional({ maxLength: AGENT_NAME_MAX_LENGTH, example: 'finding-retest' })
  @IsOptional()
  @IsString()
  @MaxLength(AGENT_NAME_MAX_LENGTH)
  @Matches(AGENT_NAME_PATTERN, {
    message: 'name must be a lowercase slug (a-z, 0-9 and single dashes)',
  })
  name?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @ApiPropertyOptional({ enum: AgentDefinitionMode })
  @IsOptional()
  @IsEnum(AgentDefinitionMode)
  mode?: AgentDefinitionMode;

  @ApiPropertyOptional({ enum: CUSTOM_SCOPES })
  @IsOptional()
  @IsIn(CUSTOM_SCOPES)
  scope?: CustomScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(AGENT_INSTRUCTION_MAX_LENGTH)
  systemPrompt?: string;

  @ApiPropertyOptional({
    type: AgentDefinitionMetadataDto,
    description: 'Replaces the whole metadata object',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentDefinitionMetadataDto)
  metadata?: AgentDefinitionMetadataDto;
}

export class AgentDefinitionResponseDto {
  @ApiProperty({ description: 'Row id, or "builtin-<name>" for built-in agents' })
  id: string;

  @ApiProperty({ example: 'finding-retest' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  title: string | null;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: AgentDefinitionMode })
  mode: AgentDefinitionMode;

  @ApiProperty({ enum: AgentDefinitionScope })
  scope: AgentDefinitionScope;

  @ApiProperty()
  isBuiltin: boolean;

  /** The caller created it, so it may edit or delete it */
  @ApiProperty({ description: 'Whether the current user can edit or delete it' })
  canEdit: boolean;

  @ApiProperty()
  systemPrompt: string;

  @ApiProperty({ type: AgentDefinitionMetadataDto })
  metadata: AgentDefinitionMetadataDto;

  @ApiProperty({ nullable: true, type: String, description: 'null for built-in agents' })
  createdBy: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
