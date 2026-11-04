import { DataKind, ToolCategory } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCronSchedule } from './cron-schedule.validator';
import { ScopeRuleInputDto } from './project-scope.dto';
import { ProjectWorkflowOnDto } from './project-workflow-on.dto';

export class ProjectToolInput {
  @ApiProperty({ description: 'Tool ID' })
  @IsUUID()
  toolId: string;

  @ApiProperty({
    required: false,
    type: Object,
    description: 'Inline config override for this tool',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Reference to a saved config profile',
  })
  @IsOptional()
  @IsUUID()
  configProfileId?: string;

  @ApiProperty({
    required: false,
    enum: ToolCategory,
    enumName: 'ToolCategory',
    description: 'Category to run the tool in (default: its first)',
  })
  @IsOptional()
  @IsEnum(ToolCategory)
  category?: ToolCategory;

  @ApiProperty({
    required: false,
    enum: DataKind,
    enumName: 'DataKind',
    isArray: true,
    description:
      'Kinds of data the tool takes, best first (default: its own inputs). Must be among the ones its category accepts.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DataKind, { each: true })
  input?: DataKind[];

  @ApiProperty({
    required: false,
    minimum: 1,
    description:
      'Pipeline stage, from 1. Tools of a stage run in parallel; the next stage waits for them. Default 1.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  stage?: number;
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const HEX_COLOR_MESSAGE =
  'hexColor must be a 6-digit hex color, e.g. `#78716C`';

export class CreateProjectDto {
  @ApiProperty({ description: 'Name of the project', example: 'Web Servers' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Hex color of the project',
    example: '#78716C',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: HEX_COLOR_MESSAGE })
  hexColor?: string;

  @ApiProperty({ required: false, description: 'What the project covers' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    description: 'Asset (host) IDs picked by hand',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(1000)
  hostIds?: string[];

  @ApiProperty({
    description: 'Scope rules; matching assets join the project',
    type: [ScopeRuleInputDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScopeRuleInputDto)
  scopeRules?: ScopeRuleInputDto[];

  @ApiProperty({
    required: false,
    default: true,
    description: 'Add assets found later when they match a rule',
  })
  @IsOptional()
  @IsBoolean()
  autoAddAssets?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Workflow template (file name of a default workflow) for the pipeline. Ignored when tools are given.',
    example: 'vulnerability_scan_basic.yaml',
  })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiProperty({
    description: 'Tools of the pipeline, with optional stages',
    type: [ProjectToolInput],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProjectToolInput)
  tools?: ProjectToolInput[];

  @ApiProperty({ required: false, description: 'Name of the pipeline' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workflowName?: string;

  @ApiProperty({
    required: false,
    type: () => ProjectWorkflowOnDto,
    description:
      'When the pipeline runs on its own: schedules and events. Requires a pipeline. Replaces schedule.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectWorkflowOnDto)
  on?: ProjectWorkflowOnDto;

  @ApiProperty({
    description:
      'Deprecated, use on.schedule. Cron schedule (UTC) of the pipeline, e.g. "0 2 * * 1". Requires a pipeline.',
    example: '0 0 */3 * *',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsCronSchedule()
  schedule?: string;

  @ApiProperty({
    required: false,
    description: 'Start a run on the whole scope right after creation',
  })
  @IsOptional()
  @IsBoolean()
  runNow?: boolean;
}
