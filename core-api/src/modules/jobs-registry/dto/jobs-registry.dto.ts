import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { JobStatus, ToolCategory } from 'src/common/enums/enum';
import { JobDataResultType } from 'src/common/types/app.types';
import { Tool } from 'src/modules/tools/entities/tools.entity';
import { Workflow } from 'src/modules/workflows/entities/workflow.entity';
import { JobHistory } from '../entities/job-history.entity';
import { Job } from '../entities/job.entity';

export class GetNextJobResponseDto {
  @ApiProperty()
  jobId: string;
  @ApiProperty()
  value: string;
  @ApiProperty()
  category: ToolCategory;
  @ApiProperty({
    description: 'Command to run',
  })
  command?: string;
  job: Job;
}

export class WorkerIdParams {
  @ApiProperty()
  @IsUUID()
  workerId: string;
}

export class DataPayloadResult {
  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  error: boolean;

  @ApiProperty()
  @IsOptional()
  @IsOptional()
  raw: string;

  @ApiProperty()
  @IsOptional()
  payload: JobDataResultType;
}
export class UpdateResultDto {
  @ApiProperty()
  @IsUUID()
  jobId: string;
  @ApiProperty()
  @IsObject()
  data: DataPayloadResult;
}

export class GetManyJobsQueryParams extends GetManyBaseQueryParams {
  @ApiProperty({
    description: 'Filter jobs by status',
    enum: [...Object.values(JobStatus), 'all'],
    default: 'all',
  })
  @IsIn([...Object.values(JobStatus), 'all'])
  jobStatus: JobStatus | 'all';

  @ApiProperty({
    description: 'Filter jobs by worker name',
    enum: [...Object.values(ToolCategory), 'all'],
    default: 'all',
  })
  @IsIn([...Object.values(ToolCategory), 'all'])
  workerName: ToolCategory | 'all';
}

export class JobTimelineItem {
  @ApiProperty()
  name: string;

  @ApiProperty()
  target: string;

  @ApiProperty()
  targetId: string;

  @ApiProperty()
  jobHistoryId: string;

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  endTime: Date;

  @ApiProperty()
  status: JobStatus;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  toolCategory?: ToolCategory;

  @ApiProperty()
  duration?: number;
}

/**
 * Represents the raw SQL query result for the jobs timeline query.
 * This interface maps directly to the columns returned by the jobs timeline SQL query.
 */
export interface JobTimelineQueryResult {
  name: string;
  target: string;
  target_id: string;
  jobHistoryId: string;
  start_time: Date;
  end_time: Date;
  statuses: string;
  description: string;
  tool_category: ToolCategory;
  duration_seconds: number;
}

export class JobTimelineResponseDto {
  @ApiProperty({ type: [JobTimelineItem] })
  data: JobTimelineItem[];
}
export class CreateJobsDto {
  @ApiProperty()
  @IsUUID('all', { each: true })
  toolIds: string[];

  @ApiProperty()
  @IsUUID()
  targetId: string;
}

export class CreateJobs extends PickType(Job, ['priority', 'isSaveRawResult', 'isSaveData', 'command', 'isPublishEvent'] as const) {
  tool: Tool;
  targetIds: string[];
  assetIds?: string[];
  workspaceId?: string;
  workflow?: Workflow;
  jobHistory?: JobHistory;
}
