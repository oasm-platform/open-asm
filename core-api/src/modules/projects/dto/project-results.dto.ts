import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import {
  DismissReason,
  JobRunType,
  JobStatus,
  ProjectChange,
  ProjectTriggerType,
  Severity,
} from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { VulnerabilityStatus } from '@/modules/vulnerabilities/dto/get-vulnerability.dto';
import { VulnerabilityProvenance } from '../provenance';
import { SeverityCountsDto } from './project-assets.dto';

const toArray = ({ value }: { value: unknown }): unknown[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class ProjectRunRefDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() workflowName: string;
  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' })
  status: JobStatus;
  @ApiProperty({ enum: JobRunType, enumName: 'JobRunType' })
  jobRunType: JobRunType;
}

export class WeeklyNewVulnerabilitiesDto {
  @ApiProperty({ description: 'Monday of the week (ISO date)' })
  week: string;
  @ApiProperty() critical: number;
  @ApiProperty() high: number;
  @ApiProperty() medium: number;
  @ApiProperty() low: number;
  @ApiProperty() info: number;
}

/**
 * One entry of a project's recent activity: a run, a change to the project
 * (`audit`: its action, and for an update which `change`), or
 * vulnerabilities someone dismissed.
 */
export class ProjectActivityDto {
  @ApiProperty({ enum: ['run', 'audit', 'dismissed'] })
  kind: 'run' | 'audit' | 'dismissed';
  @ApiProperty() at: Date;
  @ApiProperty({ description: 'Run id, audit action, or `dismissed`' })
  ref: string;
  @ApiProperty({
    required: false,
    enum: ProjectChange,
    enumName: 'ProjectChange',
    description: 'What a `project.updated` audit changed',
  })
  change?: ProjectChange;
  @ApiProperty({ required: false, description: 'Assets that joined' })
  added?: number;
  @ApiProperty({ required: false, description: 'Assets that left' })
  removed?: number;
  @ApiProperty({ required: false, description: 'Vulnerabilities dismissed' })
  count?: number;
  @ApiProperty({
    required: false,
    enum: DismissReason,
    enumName: 'DismissReason',
    description: 'Why the vulnerabilities were dismissed',
  })
  reason?: DismissReason;
  @ApiProperty({ required: false }) runStatus?: string;
  @ApiProperty({ required: false }) workflowName?: string;
  @ApiProperty({ required: false }) jobRunType?: string;
  @ApiProperty({ required: false }) newVulnerabilities?: number;
  @ApiProperty({ required: false }) recurringVulnerabilities?: number;
  @ApiProperty({ required: false }) scopeSize?: number;
  @ApiProperty({ required: false }) actorName?: string;
  @ApiProperty({ required: false, type: Object })
  changes?: Record<string, unknown>;
}

export class ProjectOverviewDto {
  @ApiProperty() totalAssets: number;
  @ApiProperty({ description: 'Assets that joined in the last 7 days' })
  newAssets: number;
  @ApiProperty() workflows: number;
  @ApiProperty({ type: () => SeverityCountsDto })
  openVulnerabilities: SeverityCountsDto;
  @ApiProperty({ description: 'Open vulnerabilities first seen in the last 7 days' })
  newVulnerabilities: number;
  @ApiProperty({ type: () => [ProjectRunRefDto], description: 'Runs that found them' })
  newVulnerabilityRuns: ProjectRunRefDto[];
  @ApiProperty({ type: () => ProjectRunRefDto, required: false, nullable: true })
  lastRun: ProjectRunRefDto | null;
  @ApiProperty({ type: () => [WeeklyNewVulnerabilitiesDto] })
  weekly: WeeklyNewVulnerabilitiesDto[];
  @ApiProperty({ type: () => [ProjectActivityDto] })
  activity: ProjectActivityDto[];
}

export class GetProjectRunsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  projectWorkflowId?: string;

  @ApiProperty({ required: false, enum: JobRunType, enumName: 'JobRunType' })
  @IsOptional()
  @IsEnum(JobRunType)
  jobRunType?: JobRunType;
}

export class ProjectRunDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty() isCompleted: boolean;
  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' })
  status: JobStatus;
  @ApiProperty({ enum: JobRunType, enumName: 'JobRunType' })
  jobRunType: JobRunType;
  @ApiProperty({ type: String, required: false, nullable: true })
  projectWorkflowId: string | null;
  @ApiProperty() workflowName: string;
  @ApiProperty({ enum: ProjectTriggerType, enumName: 'ProjectTriggerType', required: false, nullable: true })
  triggerType: ProjectTriggerType | null;
  @ApiProperty({ description: 'Assets in the run scope' })
  scopeSize: number;
  @ApiProperty() stepsTotal: number;
  @ApiProperty({ description: 'Steps that finished (done, or nothing to scan)' })
  stepsDone: number;
  @ApiProperty() stepsFailed: number;
  @ApiProperty({ description: 'Vulnerabilities this run found first' })
  newVulnerabilities: number;
  @ApiProperty({ description: 'Vulnerabilities this run reported again' })
  recurringVulnerabilities: number;
}

export class GetProjectVulnerabilitiesQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    enum: VulnerabilityProvenance,
    enumName: 'VulnerabilityProvenance',
  })
  @IsOptional()
  @IsEnum(VulnerabilityProvenance)
  provenance?: VulnerabilityProvenance;

  @ApiProperty({ required: false, enum: Severity, enumName: 'Severity', isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(Severity, { each: true })
  severity?: Severity[];

  @ApiProperty({
    required: false,
    enum: VulnerabilityStatus,
    enumName: 'VulnerabilityStatus',
    default: VulnerabilityStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(VulnerabilityStatus)
  status?: VulnerabilityStatus = VulnerabilityStatus.OPEN;

  @ApiProperty({ required: false, description: 'Seen by runs of this project workflow' })
  @IsOptional()
  @IsUUID()
  projectWorkflowId?: string;

  @ApiProperty({ required: false, description: 'First or last seen in this run' })
  @IsOptional()
  @IsUUID()
  jobHistoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assetId?: string;
}

export class ProjectSightingDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  runId: string | null;
  @ApiProperty() at: Date;
}

export class ProjectVulnerabilityDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: Severity, enumName: 'Severity' })
  severity: Severity;
  @ApiProperty({ type: [String], required: false, nullable: true })
  cveId: string[] | null;
  @ApiProperty({ type: String, required: false, nullable: true })
  affectedUrl: string | null;
  @ApiProperty() assetId: string;
  @ApiProperty() assetValue: string;
  @ApiProperty({ type: String, required: false, nullable: true })
  toolName: string | null;
  @ApiProperty({ enum: VulnerabilityStatus, enumName: 'VulnerabilityStatus' })
  status: VulnerabilityStatus;
  @ApiProperty({ enum: VulnerabilityProvenance, enumName: 'VulnerabilityProvenance' })
  provenance: VulnerabilityProvenance;
  @ApiProperty() timesSeen: number;
  @ApiProperty({ type: () => ProjectSightingDto })
  firstSeen: ProjectSightingDto;
  @ApiProperty({ type: () => ProjectSightingDto })
  lastSeen: ProjectSightingDto;
}

export class ProvenanceCountsDto {
  @ApiProperty() all: number;
  @ApiProperty() new: number;
  @ApiProperty() recurring: number;
  @ApiProperty() notSeen: number;
}

export class ProjectVulnerabilitiesResponseDto {
  @ApiProperty({ type: () => [ProjectVulnerabilityDto] })
  data: ProjectVulnerabilityDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() pageCount: number;
  @ApiProperty() hasNextPage: boolean;
  @ApiProperty({ type: () => ProvenanceCountsDto, description: 'Under every filter but provenance' })
  provenanceCounts: ProvenanceCountsDto;
  @ApiProperty({ type: () => SeverityCountsDto, description: 'Under every filter but severity' })
  severityCounts: SeverityCountsDto;
}

export enum TimelineSighting {
  SEEN = 'seen',
  MISSED = 'missed',
  UNKNOWN = 'unknown',
}

export class TimelineRunDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() workflowName: string;
  @ApiProperty({ enum: TimelineSighting, enumName: 'TimelineSighting' })
  sighting: TimelineSighting;
}

export class VulnerabilityTimelineDto {
  @ApiProperty({ type: () => ProjectVulnerabilityDto })
  vulnerability: ProjectVulnerabilityDto;
  @ApiProperty({
    type: () => [TimelineRunDto],
    description:
      'Project runs since the first sighting that scanned the asset with the reporting tool',
  })
  runs: TimelineRunDto[];
}
