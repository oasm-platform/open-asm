import {
  ProjectTriggerEvent,
  ProjectTriggerType,
  RunOutcome,
  Severity,
  TargetType,
} from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCronSchedule } from './cron-schedule.validator';

/**
 * Settings of an event trigger; each filter applies to one event:
 * `workflows` and `status` (run outcomes that start a run) to
 * `project.run.completed`, `severity` (severities that start a run) to
 * `vulnerability.detected`. The enum-typed ones carry no description, which
 * the client generator would copy onto the shared enum.
 */
export class EventTriggerConfigDto {
  @ApiProperty({
    required: false,
    default: 10,
    description:
      'Minutes to gather the assets of the event into one run; also the least time between two runs',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  windowMinutes?: number;

  @ApiProperty({
    required: false,
    default: 200,
    description: 'Most assets one run takes; more start further runs',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  maxAssets?: number;

  @ApiProperty({
    required: false,
    enum: TargetType,
    enumName: 'TargetType',
    isArray: true,
    description: 'Only assets of these target types; empty = all',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(TargetType, { each: true })
  targetTypes?: TargetType[];

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'project.run.completed: names of the workflows of the project to follow; empty = any other',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  workflows?: string[];

  @ApiProperty({
    required: false,
    enum: RunOutcome,
    enumName: 'RunOutcome',
    isArray: true,
    default: [RunOutcome.SUCCESS],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RunOutcome, { each: true })
  status?: RunOutcome[];

  @ApiProperty({
    required: false,
    enum: Severity,
    enumName: 'Severity',
    isArray: true,
    default: [Severity.CRITICAL, Severity.HIGH],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Severity, { each: true })
  severity?: Severity[];
}

export class CreateProjectTriggerDto {
  @ApiProperty({ description: 'Project workflow (binding) the trigger runs' })
  @IsUUID()
  projectWorkflowId: string;

  @ApiProperty({ enum: ProjectTriggerType, enumName: 'ProjectTriggerType' })
  @IsEnum(ProjectTriggerType)
  type: ProjectTriggerType;

  @ApiProperty({
    required: false,
    description: '5-field cron (UTC); required for cron triggers',
    example: '0 2 * * 1',
  })
  @IsOptional()
  @IsString()
  @IsCronSchedule()
  cron?: string;

  @ApiProperty({
    required: false,
    enum: ProjectTriggerEvent,
    enumName: 'ProjectTriggerEvent',
    description: 'The event it runs on; required for event triggers',
  })
  @IsOptional()
  @IsEnum(ProjectTriggerEvent)
  event?: ProjectTriggerEvent;

  @ApiProperty({ required: false, type: () => EventTriggerConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventTriggerConfigDto)
  config?: EventTriggerConfigDto;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateProjectTriggerDto {
  @ApiProperty({ required: false, example: '0 2 * * 1' })
  @IsOptional()
  @IsString()
  @IsCronSchedule()
  cron?: string;

  @ApiProperty({ required: false, type: () => EventTriggerConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventTriggerConfigDto)
  config?: EventTriggerConfigDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
