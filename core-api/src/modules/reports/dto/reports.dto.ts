import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

const ReportType = { SUMMARY: 'SUMMARY', VULNERABILITY: 'VULNERABILITY' } as const;
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
}

export class GenerateReportBodyDto {
  @ApiProperty({ enum: ['SUMMARY', 'VULNERABILITY'], default: 'SUMMARY' })
  @IsEnum(['SUMMARY', 'VULNERABILITY'])
  @IsOptional()
  type?: ReportType;

  @ApiProperty({ required: false, description: 'Start date for vulnerability report filter' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date for vulnerability report filter' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Target IDs to filter vulnerabilities', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[];
}

export class GetManyReportsQueryDto extends GetManyBaseQueryParams {}
