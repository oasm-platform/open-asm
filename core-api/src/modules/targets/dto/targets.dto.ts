import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { CronSchedule, ScanStatus } from '@/common/enums/enum';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Target } from '../entities/target.entity';

export class CreateTargetDto extends PickType(Target, ['value'] as const) {}

/**
 * DTO for creating multiple targets in a single request
 */
export class CreateMultipleTargetsDto {
  @ApiProperty({
    description: 'Array of target values to create',
    type: [CreateTargetDto],
    example: [{ value: 'example.com' }, { value: 'test.com' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTargetDto)
  targets: CreateTargetDto[];
}

/**
 * DTO representing the result of a bulk target creation operation
 */
export class BulkTargetResultDto {
  @ApiProperty({
    description: 'List of successfully created targets',
    type: [Target],
  })
  created: Target[];

  @ApiProperty({
    description: 'List of target values that were skipped (already exist)',
    example: ['existing.com', 'duplicate.com'],
  })
  skipped: string[];

  @ApiProperty({
    description: 'Total number of targets requested to create',
    example: 10,
  })
  @IsInt()
  totalRequested: number;

  @ApiProperty({
    description: 'Total number of targets successfully created',
    example: 8,
  })
  @IsInt()
  totalCreated: number;

  @ApiProperty({
    description: 'Total number of targets skipped (duplicates)',
    example: 2,
  })
  @IsInt()
  totalSkipped: number;
}

export class GetManyTargetResponseDto {
  @ApiProperty()
  @IsUUID('4')
  id: string;

  @ApiProperty()
  value: string;

  @ApiProperty()
  reScanCount: number;

  @ApiProperty({ enum: CronSchedule })
  scanSchedule: CronSchedule;

  @ApiProperty({ enum: ScanStatus, example: ScanStatus.DONE })
  status?: ScanStatus;

  @ApiProperty({ example: 100 })
  totalAssets: number;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  lastDiscoveredAt: Date;
}

export class GetManyWorkspaceQueryParamsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  value?: string;
}

export class UpdateTargetDto {
  @ApiProperty({ enum: CronSchedule })
  @IsString()
  @IsEnum(CronSchedule)
  @IsOptional()
  scanSchedule?: CronSchedule;
}
