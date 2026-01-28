import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ReportStatus, ReportRole } from '../entities/security-report.entity';
import { ReportContent } from '../interfaces/report-content.interface';

export class CreateReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  content?: ReportContent;

  @ApiProperty({ required: false, enum: ReportStatus })
  @IsEnum(ReportStatus)
  @IsOptional()
  status?: ReportStatus;

  @ApiProperty({ required: false, enum: ReportRole })
  @IsEnum(ReportRole)
  @IsOptional()
  targetRole?: ReportRole;
}

export class UpdateReportDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  content?: ReportContent;

  @ApiProperty({ required: false, enum: ReportStatus })
  @IsEnum(ReportStatus)
  @IsOptional()
  status?: ReportStatus;

  @ApiProperty({ required: false, enum: ReportRole })
  @IsEnum(ReportRole)
  @IsOptional()
  targetRole?: ReportRole;
}
