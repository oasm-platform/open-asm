import { ApiProperty } from '@nestjs/swagger';
// Value import, not `import type`: `@ApiProperty({ type: () => WorkflowContent })`
// dereferences the class at runtime when the Swagger document is built.
import { WorkflowContent } from '../../workflows/entities/workflow.entity';
import { WorkflowStepStatusDto } from './job-history-detail.dto';

/**
 * The workflow of one run: the definition as stored when the run started,
 * plus the step state of that run.
 */
export class JobHistoryWorkflowResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  jobHistoryName?: string;

  @ApiProperty({ required: false })
  workflowId?: string;

  @ApiProperty({ required: false })
  workflowName?: string;

  @ApiProperty({ type: () => WorkflowContent, required: false })
  content?: WorkflowContent;

  @ApiProperty({ type: () => [WorkflowStepStatusDto] })
  steps: WorkflowStepStatusDto[];
}
