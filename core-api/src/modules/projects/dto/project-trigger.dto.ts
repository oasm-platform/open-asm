import { ProjectTriggerType, TargetType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCronSchedule } from './cron-schedule.validator';

export class AssetsAddedTriggerConfigDto {
  @ApiProperty({
    required: false,
    default: 10,
    description: 'Minutes to gather new assets into one run',
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

  @ApiProperty({ required: false, type: () => AssetsAddedTriggerConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssetsAddedTriggerConfigDto)
  config?: AssetsAddedTriggerConfigDto;

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

  @ApiProperty({ required: false, type: () => AssetsAddedTriggerConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssetsAddedTriggerConfigDto)
  config?: AssetsAddedTriggerConfigDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
