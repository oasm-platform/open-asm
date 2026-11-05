import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ProjectTriggerEvent, ProjectTriggerType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SeverityCountsDto } from './project-assets.dto';

export enum ProjectStatusFilter {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  ALL = 'all',
}

export class GetProjectsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    enum: ProjectStatusFilter,
    enumName: 'ProjectStatusFilter',
    default: ProjectStatusFilter.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ProjectStatusFilter)
  status?: ProjectStatusFilter = ProjectStatusFilter.ACTIVE;

  @ApiProperty({
    required: false,
    isArray: true,
    description: 'Only projects holding assets of these targets',
  })
  @IsUUID(4, { each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  targetIds?: string[];
}

export class ProjectTriggerSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() projectWorkflowId: string;
  @ApiProperty({ enum: ProjectTriggerType, enumName: 'ProjectTriggerType' })
  type: ProjectTriggerType;
  @ApiProperty({ type: String, required: false, nullable: true })
  cron: string | null;
  @ApiProperty({
    enum: ProjectTriggerEvent,
    enumName: 'ProjectTriggerEvent',
    required: false,
    nullable: true,
  })
  event: ProjectTriggerEvent | null;
  @ApiProperty() enabled: boolean;
}

/** One project card. */
export class ProjectListItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() hexColor: string;
  @ApiProperty({ type: String, required: false, nullable: true })
  description: string | null;
  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  archivedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty() totalAssets: number;
  @ApiProperty() workflowCount: number;
  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  lastRunAt: Date | null;
  @ApiProperty({ type: () => SeverityCountsDto, description: 'Open vulnerabilities the project found' })
  openVulnerabilities: SeverityCountsDto;
  @ApiProperty({ description: 'Vulnerabilities first seen in the last 7 days' })
  newVulnerabilities: number;
  @ApiProperty({ type: () => [ProjectTriggerSummaryDto] })
  triggers: ProjectTriggerSummaryDto[];
}
