import { JobStatus, ToolCategory } from '@/common/enums/enum';
import { AssetService } from '@/modules/assets/entities/asset-services.entity';
import { ApiProperty } from '@nestjs/swagger';
import { JobErrorLog } from '../entities/job-error-log.entity';

/**
 * Slim tool payload returned by the jobs list endpoint. Only the columns the
 * UI renders are selected in the query, so the contract must not expose the
 * full Tool entity.
 */
export class JobListItemToolDto {
  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false })
  logoUrl?: string;
}

/**
 * Slim asset payload returned by the jobs list endpoint (see ToolDto note).
 */
export class JobListItemAssetDto {
  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty({ required: false })
  value?: string;

  @ApiProperty({ required: false })
  targetId?: string;
}

/**
 * Response DTO for a single row of GET /jobs-registry. Mirrors exactly the
 * columns the query hydrates: slim tool/asset relations plus the job columns
 * the console renders (status, dates, assetService, errorLogs).
 */
export class JobListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: JobStatus })
  status?: JobStatus;

  @ApiProperty({ enum: ToolCategory })
  category: ToolCategory;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  pickJobAt?: Date;

  @ApiProperty({ required: false })
  completedAt?: Date;

  @ApiProperty({ required: false })
  assetServiceId?: string;

  @ApiProperty({
    required: false,
    description: 'JobPriority: 0 = critical, 4 = background',
  })
  priority?: number;

  @ApiProperty({ required: false })
  workerId?: string;

  @ApiProperty({ required: false })
  retryCount?: number;

  /** Fully bound shell command; empty for connector jobs. */
  @ApiProperty({ required: false })
  command?: string;

  /**
   * Merged config the worker received, with every secret masked (`****…`).
   * Never expose the raw column: it is persisted decrypted.
   */
  @ApiProperty({ required: false, type: Object })
  config?: Record<string, unknown> | null;

  @ApiProperty({ type: () => JobListItemToolDto })
  tool?: JobListItemToolDto;

  @ApiProperty({ type: () => JobListItemAssetDto })
  asset?: JobListItemAssetDto;

  @ApiProperty({ type: () => AssetService })
  assetService?: AssetService;

  @ApiProperty({ type: () => [JobErrorLog] })
  errorLogs?: JobErrorLog[];
}
