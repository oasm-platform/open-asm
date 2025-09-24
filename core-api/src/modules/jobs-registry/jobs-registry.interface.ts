import { Tool } from "../tools/entities/tools.entity";
import { Workflow } from "../workflows/entities/workflow.entity";
import { JobHistory } from "./entities/job-history.entity";

export interface CreateJobs {
    tools: Tool[];
    targetIds: string[];
    assetIds?: string[];
    workspaceId?: string;
    workflow?: Workflow;
    jobHistory?: JobHistory;
    priority?: number;
    isSaveRawResult?: boolean
}
