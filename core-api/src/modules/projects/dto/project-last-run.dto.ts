import { JobRunType, JobStatus, ProjectTriggerEvent } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Summary of the most recent run (job history) of a project workflow.
 * Mirrors JobHistoryResponseDto from the jobs-registry module without
 * importing it, to avoid circular module/entity dependencies.
 */
export class ProjectLastRunDto {
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

  @ApiProperty({
    enum: ProjectTriggerEvent,
    enumName: 'ProjectTriggerEvent',
    required: false,
    nullable: true,
  })
  triggerEvent?: ProjectTriggerEvent | null;
}
