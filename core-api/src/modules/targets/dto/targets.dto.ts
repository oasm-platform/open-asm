import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { CronSchedule, JobStatus, ScanStatus, TargetScopeType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
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
import { Target, TargetType } from '../entities/target.entity';

export class CreateTargetDto {
  @ApiProperty({
    example: 'example.com',
    description: 'The target value (domain, IP address, or CIDR notation)',
  })
  @IsString()
  value: string;

  @ApiProperty({
    enum: TargetType,
    enumName: 'TargetType',
    description: 'The type of target (DOMAIN, CIDR, or IP)',
    example: TargetType.DOMAIN,
    required: false,
    default: TargetType.DOMAIN,
  })
  @IsEnum(TargetType)
  @IsOptional()
  type?: TargetType = TargetType.DOMAIN;
}

/**
 * DTO for creating multiple targets in a single request
 */
export class CreateMultipleTargetsDto {
  @ApiProperty({
    description:
      'Array of target values to create. Supports DOMAIN (root domain), CIDR (/24 range only), and IP (single IP address) types.',
    type: [CreateTargetDto],
    example: [
      { value: 'example.com', type: 'DOMAIN' },
      { value: '192.168.1.0/24', type: 'CIDR' },
      { value: '8.8.8.8', type: 'IP' },
    ],
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

  @ApiProperty({ enum: TargetType, enumName: 'TargetType' })
  type: TargetType;

  @ApiProperty()
  reScanCount: number;

  @ApiProperty({ enum: CronSchedule })
  scanSchedule: CronSchedule;

  @ApiProperty({ enum: ScanStatus, example: ScanStatus.DONE })
  status?: ScanStatus;

  @ApiProperty({ example: 100 })
  totalAssetServices: number;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  lastDiscoveredAt: Date;

  @ApiProperty()
  internalNetworkId: string;
}

export class GetManyWorkspaceQueryParamsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  value?: string;

  @ApiProperty({
    required: false,
    enum: TargetType,
    enumName: 'TargetType',
    description: 'Filter by target type (DOMAIN, CIDR, or IP)',
  })
  @IsEnum(TargetType)
  @IsOptional()
  type?: TargetType;

  @ApiProperty({
    required: false,
    enum: JobStatus,
    enumName: 'JobStatus',
    description:
      'Filter by scan status (pending, in_progress, completed, failed, cancelled)',
  })
  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;

  @ApiProperty({
    required: false,
    enum: TargetScopeType,
    enumName: 'TargetScopeType',
    description: 'Filter by target scope (INTERNAL or EXTERNAL)',
  })
  @IsEnum(TargetScopeType)
  @IsOptional()
  scope?: TargetScopeType;
}

export class UpdateTargetDto {
  @ApiProperty({ enum: CronSchedule })
  @IsString()
  @IsEnum(CronSchedule)
  @IsOptional()
  scanSchedule?: CronSchedule;
}
