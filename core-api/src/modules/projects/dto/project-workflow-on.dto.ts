import { ProjectTriggerEvent } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EventTriggerConfigDto } from './project-trigger.dto';

/** One schedule of a workflow, as the workflow editor sends it. */
export class ScheduleInputDto {
  @ApiProperty({
    example: '0 2 * * 1',
    description: '5-field cron expression, in UTC',
  })
  @IsString()
  @MaxLength(100)
  cron: string;

  @ApiProperty({
    required: false,
    default: true,
    description:
      'Off keeps the schedule in the workflow without running it. Omitted: a new schedule is on, an existing one keeps its state.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** One event trigger of a workflow, as the workflow editor sends it. */
export class EventTriggerInputDto extends EventTriggerConfigDto {
  @ApiProperty({ enum: ProjectTriggerEvent, enumName: 'ProjectTriggerEvent' })
  @IsEnum(ProjectTriggerEvent)
  event: ProjectTriggerEvent;

  @ApiProperty({
    required: false,
    default: true,
    description:
      'Off keeps the trigger in the workflow without running it. Omitted: a new trigger is on, an existing one keeps its state.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * When a project workflow runs on its own: the `on:` block of its file
 * (see projects/workflow-on.ts). Sent whole: what it leaves out is removed.
 */
export class ProjectWorkflowOnDto {
  @ApiProperty({ required: false, type: [ScheduleInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ScheduleInputDto)
  schedule?: ScheduleInputDto[];

  @ApiProperty({
    required: false,
    type: [EventTriggerInputDto],
    description: 'Events the workflow runs on, one entry per event; absent or empty = none',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(ProjectTriggerEvent).length)
  @ValidateNested({ each: true })
  @Type(() => EventTriggerInputDto)
  events?: EventTriggerInputDto[];
}
