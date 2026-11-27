import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsEnum, IsUUID, IsIn, IsNotIn, Matches } from 'class-validator';
import { IsCronSchedule } from '@/modules/projects/dto/cron-schedule.validator';

const ReportType = {
  SUMMARY: 'SUMMARY',
  VULNERABILITY: 'VULNERABILITY',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export class ReportResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  path: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty({ enum: ['SUMMARY', 'VULNERABILITY'] })
  type: ReportType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    description:
      'Presigned S3 download URL (hour-bucketed signature, default 2 days)',
  })
  downloadUrl: string;

  @ApiProperty({
    example: 172800,
    description: 'Presigned URL lifetime in seconds',
  })
  downloadExpiresIn: number;
}

export class GenerateSummaryReportBodyDto {
  @ApiProperty({
    required: false,
    description: 'Start date for summary report filter',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End date for summary report filter',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Target IDs to filter summary data',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[];
}

export class GenerateQueryReportBodyDto {
  @ApiProperty({ description: 'Saved attack surface query to render' })
  @IsUUID()
  savedQueryId: string;
}

export class GenerateVulReportBodyDto {
  @ApiProperty({
    required: false,
    description: 'Start date for vulnerability report filter',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End date for vulnerability report filter',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Target IDs to filter vulnerabilities',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[];

  @ApiProperty({
    required: false,
    description: 'Vulnerability IDs to include in report',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vulnIds?: string[];

  @ApiProperty({
    required: false,
    description: 'Minimum severity level (CRITICAL, HIGH, MEDIUM, LOW, INFO)',
    enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
  })
  @IsOptional()
  @IsEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'])
  minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

export class PreviewSummaryQueryDto {
  @ApiProperty({ required: false, description: 'Start date for filter' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date for filter' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Target IDs to filter', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[];
}

export class PreviewVulQueryDto {
  @ApiProperty({ required: false, description: 'Start date for filter' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date for filter' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Target IDs to filter', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[];

  @ApiProperty({ required: false, description: 'Vulnerability IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vulnIds?: string[];

  @ApiProperty({ required: false, description: 'Minimum severity level', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] })
  @IsOptional()
  @IsEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'])
  minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

export class GetManyReportsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    enum: ['SUMMARY', 'VULNERABILITY'],
    description: 'Filter by report type',
  })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;
}

export class CreateReportScheduleDto {
  @ApiProperty({ enum: ['SUMMARY', 'VULNERABILITY'] })
  @IsIn(['SUMMARY', 'VULNERABILITY'])
  type: 'SUMMARY' | 'VULNERABILITY';

  @ApiProperty({ example: '0 8 * * 1', description: '5-field cron expression in UTC, at most hourly (a fixed minute)' })
  @IsCronSchedule()
  @IsNotIn(['disabled'])
  // Each run stores a PDF against the quota and holds the single schedule worker.
  @Matches(/^\s*\d{1,2}\s/, { message: 'cron must run at most once an hour (a fixed minute)' })
  cron: string;

  @ApiProperty({ required: false, type: [String], description: 'Target IDs to filter' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  targetIds?: string[];

  @ApiProperty({ required: false, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'], description: 'Vulnerability report only' })
  @IsOptional()
  @IsEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'])
  minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

class ReportScheduleOptionsDto {
  @ApiProperty({ required: false, type: [String] })
  targetIds?: string[];

  @ApiProperty({ required: false, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] })
  minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

export class ReportScheduleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Owner: the report runs with their permissions' })
  userId: string;

  @ApiProperty({ enum: ['SUMMARY', 'VULNERABILITY'] })
  type: 'SUMMARY' | 'VULNERABILITY';

  @ApiProperty({ description: '5-field cron expression in UTC' })
  cron: string;

  @ApiProperty({ type: ReportScheduleOptionsDto })
  options: ReportScheduleOptionsDto;

  @ApiProperty()
  createdAt: Date;
}
