import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

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
}

export class GetManyReportsQueryDto extends GetManyBaseQueryParams {}
