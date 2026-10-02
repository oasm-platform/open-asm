import { JobStatus, ToolCategory } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { ApiProperty } from '@nestjs/swagger';

export class JobHistoryJobItemDetail {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status?: JobStatus;

  @ApiProperty()
  category: ToolCategory;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  completedAt?: Date;

  @ApiProperty()
  pickJobAt?: Date;

  @ApiProperty()
  priority?: number;

  @ApiProperty()
  command?: string;

  @ApiProperty()
  isSaveRawResult?: boolean;

  @ApiProperty()
  isSaveData?: boolean;

  @ApiProperty()
  isPublishEvent?: boolean;

  @ApiProperty()
  retryCount?: number;

  @ApiProperty({ type: () => Tool })
  tool?: Tool;

  @ApiProperty({ type: () => Asset })
  asset?: Asset;

  @ApiProperty({ type: () => Target })
  target?: Target;

  @ApiProperty({ type: () => [String] })
  errorLogs?: string[];

  @ApiProperty()
  workerId?: string;
}

export class ToolWithStatusDto {
  @ApiProperty()
  id?: string;

  @ApiProperty()
  name?: string;

  @ApiProperty()
  logoUrl?: string;

  @ApiProperty({ enum: JobStatus, required: false })
  status?: JobStatus;
}

/**
 * One step of the run's workflow graph. `status` is the engine's persisted step
 * state (see `job_histories.steps`), so the UI can show which steps ran in
 * parallel and why a step never ran.
 */
export class WorkflowStepStatusDto {
  @ApiProperty({ description: 'Unique job id inside the workflow' })
  id: string;

  @ApiProperty({ description: 'Display label (the job id when no name is set)' })
  name: string;

  @ApiProperty()
  run: string;

  @ApiProperty({ type: [String], description: 'Ids of the jobs this one waits for' })
  needs: string[];

  @ApiProperty({
    enum: ['pending', 'dispatched', 'done', 'failed', 'skipped'],
  })
  status: string;

  @ApiProperty({
    required: false,
    description:
      'Why the step was skipped: no-inputs, blocked-by-failure, assets-discovery-off or run-cancelled',
  })
  reason?: string;

  @ApiProperty({ description: 'Job rows this step fanned out to' })
  jobs: number;

  @ApiProperty({
    required: false,
    description:
      'Job rows that failed. A step is still done when it produced results (unless it sets allowFailure: false)',
  })
  failed?: number;

  @ApiProperty({ required: false })
  toolId?: string;

  @ApiProperty({ required: false })
  logoUrl?: string;

  @ApiProperty({ required: false })
  dispatchedAt?: Date;

  @ApiProperty({ required: false })
  finishedAt?: Date;
}

export class JobHistoryDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: () => [ToolWithStatusDto] })
  tools?: ToolWithStatusDto[];

  @ApiProperty({ type: () => [WorkflowStepStatusDto] })
  steps?: WorkflowStepStatusDto[];

  @ApiProperty({ required: false })
  workflowName?: string;

  @ApiProperty()
  jobHistoryName?: string;

  /** Jobs still pending or in progress — the ones a cancel would stop. */
  @ApiProperty()
  activeJobsCount: number;
}
