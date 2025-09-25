import { PickType } from '@nestjs/swagger';
import type { Tool } from '../tools/entities/tools.entity';
import type { Workflow } from '../workflows/entities/workflow.entity';
import type { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';

export class CreateJobs extends PickType(Job, ['priority', 'isSaveRawResult', 'isSaveData'] as const) {
    tools: Tool[];
    targetIds: string[];
    assetIds?: string[];
    workspaceId?: string;
    workflow?: Workflow;
    jobHistory?: JobHistory;
}
