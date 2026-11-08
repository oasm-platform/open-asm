import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { JobRunType, JobStatus, Severity } from '@/common/enums/enum';
import { SeverityCountsDto } from '@/modules/projects/dto/project-assets.dto';
import { WeeklyNewVulnerabilitiesDto } from '@/modules/projects/dto/project-results.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/** One run that scanned assets of the target, with its progress there. */
export class TargetRunDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty() isCompleted: boolean;
  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' })
  status: JobStatus;
  @ApiProperty({ enum: JobRunType, enumName: 'JobRunType' })
  jobRunType: JobRunType;
  @ApiProperty() workflowName: string;
  @ApiProperty({ type: String, required: false, nullable: true })
  projectId: string | null;
  @ApiProperty({ type: String, required: false, nullable: true })
  projectName: string | null;
  @ApiProperty({ description: 'Jobs of the run on this target' })
  jobsTotal: number;
  @ApiProperty({ description: 'Of those, finished (completed or skipped)' })
  jobsDone: number;
  @ApiProperty() jobsFailed: number;
  @ApiProperty() jobsRunning: number;
  @ApiProperty({ type: String, required: false, nullable: true })
  currentTool: string | null;
  @ApiProperty({ description: 'Vulnerabilities this run first found on the target' })
  newVulnerabilities: number;
}

export class GetTargetRunsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false, description: 'Only runs still pending or in progress' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  active?: boolean;
}

export class NameCountDto {
  @ApiProperty() name: string;
  @ApiProperty() count: number;
}

export class TargetExposureDto {
  @ApiProperty({ type: () => [NameCountDto], description: 'Open ports by service count' })
  ports: NameCountDto[];
  @ApiProperty({ type: () => [NameCountDto] })
  technologies: NameCountDto[];
  @ApiProperty({ type: () => [NameCountDto] })
  statusCodes: NameCountDto[];
}

export class TargetTopVulnerabilityDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: Severity, enumName: 'Severity' })
  severity: Severity;
  @ApiProperty() assetValue: string;
  @ApiProperty({ type: [String], required: false, nullable: true })
  cveId: string[] | null;
  @ApiProperty() createdAt: Date;
}

export enum TargetInsightKind {
  CRITICAL_OPEN = 'critical_open',
  TLS_EXPIRING = 'tls_expiring',
  NEW_ASSETS = 'new_assets',
  LAST_RUN_FAILED = 'last_run_failed',
  STALE_SCAN = 'stale_scan',
  NO_SCHEDULE = 'no_schedule',
}

export enum InsightLevel {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

/** Something on the target worth acting on, computed at read time. */
export class TargetInsightDto {
  @ApiProperty({ enum: TargetInsightKind, enumName: 'TargetInsightKind' })
  kind: TargetInsightKind;
  @ApiProperty({ enum: InsightLevel, enumName: 'InsightLevel' })
  level: InsightLevel;
  @ApiProperty({ required: false }) count?: number;
  @ApiProperty({ required: false, description: 'Days, for stale scan' })
  days?: number;
  @ApiProperty({ required: false, description: 'The run, for a failed run' })
  runId?: string;
}

export class TargetProjectRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) hexColor: string | null;
  @ApiProperty({ description: 'Assets of the target in the project' })
  assets: number;
}

export class ScanProgressDto {
  @ApiProperty({ description: 'Jobs finished, failed or cancelled' })
  done: number;
  @ApiProperty() total: number;
}

export class TargetIssueRefDto {
  @ApiProperty() id: string;
  @ApiProperty() no: number;
  @ApiProperty() title: string;
  @ApiProperty() status: string;
  @ApiProperty() priority: string;
}

export class TargetOverviewDto {
  @ApiProperty() totalAssets: number;
  @ApiProperty({ description: 'Assets found in the last 7 days' })
  newAssets: number;
  @ApiProperty() totalServices: number;
  @ApiProperty({ description: 'Services found in the last 7 days' })
  newServices: number;
  @ApiProperty({ description: 'Distinct open ports' })
  openPorts: number;
  @ApiProperty({ type: () => SeverityCountsDto })
  openVulnerabilities: SeverityCountsDto;
  @ApiProperty({ description: 'Open vulnerabilities found in the last 7 days' })
  newVulnerabilities: number;
  @ApiProperty({ description: 'Vulnerabilities fixed in the last 7 days' })
  fixedVulnerabilities: number;
  @ApiProperty({ type: Date, required: false, nullable: true })
  nextScanAt: Date | null;
  @ApiProperty({ type: () => TargetRunDto, required: false, nullable: true })
  lastRun: TargetRunDto | null;
  @ApiProperty({ type: () => [TargetRunDto], description: 'Runs still pending or in progress' })
  activeRuns: TargetRunDto[];
  @ApiProperty({ type: () => [WeeklyNewVulnerabilitiesDto] })
  weekly: WeeklyNewVulnerabilitiesDto[];
  @ApiProperty({ type: () => [TargetTopVulnerabilityDto] })
  topVulnerabilities: TargetTopVulnerabilityDto[];
  @ApiProperty({ type: () => TargetExposureDto })
  exposure: TargetExposureDto;
  @ApiProperty({ type: () => [TargetInsightDto] })
  insights: TargetInsightDto[];
  @ApiProperty({ type: () => [TargetProjectRefDto] })
  projects: TargetProjectRefDto[];
  @ApiProperty({ type: () => [TargetIssueRefDto], description: 'Open issues linked to the target, its assets or vulnerabilities' })
  issues: TargetIssueRefDto[];
}

export enum TargetChangeKind {
  ASSET = 'asset',
  SERVICE = 'service',
  VULNERABILITY = 'vulnerability',
  FIXED = 'fixed',
}

/** One thing that appeared on (or left) the target. */
export class TargetChangeDto {
  @ApiProperty({ enum: TargetChangeKind, enumName: 'TargetChangeKind' })
  kind: TargetChangeKind;
  @ApiProperty() at: Date;
  @ApiProperty({ description: 'Asset, service or vulnerability id' })
  id: string;
  @ApiProperty() label: string;
  @ApiProperty({ type: String, required: false, nullable: true, description: 'Asset the change is on' })
  assetValue: string | null;
  @ApiProperty({ enum: Severity, enumName: 'Severity', required: false, nullable: true })
  severity: Severity | null;
}

export class TargetsSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty({ description: 'Targets with a pending or running job' })
  scanning: number;
  @ApiProperty({ description: 'Targets with an open critical vulnerability' })
  withCritical: number;
  @ApiProperty({ description: 'Targets with a scan schedule' })
  scheduled: number;
  @ApiProperty({ description: 'Targets not discovered in 30 days' })
  stale: number;
  @ApiProperty({ type: () => SeverityCountsDto })
  openVulnerabilities: SeverityCountsDto;
}

export class GetTargetChangesQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false, enum: TargetChangeKind, enumName: 'TargetChangeKind' })
  @IsOptional()
  @IsEnum(TargetChangeKind)
  kind?: TargetChangeKind;
}
