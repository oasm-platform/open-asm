import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateIssueDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ enum: IssueSourceType })
  @IsEnum(IssueSourceType)
  @IsOptional()
  sourceType?: IssueSourceType;

  @ApiProperty()
  @IsOptional()
  @IsString()
  sourceId?: string;
}

export class UpdateIssueDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ChangeIssueStatusDto {
  @ApiProperty({ enum: IssueStatus })
  @IsEnum(IssueStatus)
  status: IssueStatus;
}
