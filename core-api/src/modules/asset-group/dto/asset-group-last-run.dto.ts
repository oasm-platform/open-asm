import { JobRunType, JobStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Summary of the most recent run (job history) of an asset group's
 * workflows. Mirrors JobHistoryResponseDto from the jobs-registry module
 * without importing it, to avoid circular module/entity dependencies.
 */
export class AssetGroupLastRunDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: Number })
  totalJobs: number;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty()
  workflowName?: string;

  @ApiProperty()
  jobHistoryName?: string;

  @ApiProperty({ enum: JobRunType })
  jobRunType?: JobRunType;
}
