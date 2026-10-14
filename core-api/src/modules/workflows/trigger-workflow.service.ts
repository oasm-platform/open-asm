import { JobRunType } from '@/common/enums/enum';
import { WorkflowRunnerService } from '@/modules/jobs-registry/workflow-runner.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Workflow } from './entities/workflow.entity';
import { jobEntries } from './workflow-graph';

export interface TriggerWorkflowResult {
  workflowId: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class TriggerWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(TriggerWorkflowService.name);
  constructor(
    private workspaceService: WorkspacesService,
    private workflowRunnerService: WorkflowRunnerService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    // Listen all events with wildcard. Fire-and-forget: trigger() already
    // captures its result ({ success, error }) and warn-logs failures, so
    // the handler itself only guards against unexpected rejections.
    this.eventEmitter.onAny((event: string, payload: Target) => {
      void this.trigger(event, payload).catch((error) => {
        Logger.error('Error in onModuleInit:', error);
      });
    });
  }

  /**
   * Triggers the workflow matching an event for a target.
   *
   * The run itself (which steps start now, which wait on `needs`, which are
   * skipped because the workspace has assets discovery disabled) is the
   * workflow engine's decision — this method only resolves the workflow and
   * hands the run over to it.
   *
   * Returns { success, error } instead of swallowing failures — callers
   * (scheduler, webhook) persist the result to the job log.
   */
  async trigger(event: string, payload: Target): Promise<TriggerWorkflowResult> {
    const workflow = await this.getWorkflowByEvent(event, payload);
    if (!workflow) {
      return { workflowId: '', success: true };
    }

    const jobs = jobEntries(workflow.content.jobs);
    const firstProfileId = jobs[0]?.[1]?.configProfileId ?? 'none';

    try {
      if (jobs.length === 0) {
        const error = 'Workflow does not have any jobs defined.';
        this.logger.warn(
          `Trigger failed for workflow ${workflow.id}: ${error}`,
        );
        return { workflowId: workflow.id, success: false, error };
      }

      const { jobHistory } = await this.workflowRunnerService.startRun({
        workflow,
        workspaceId: workflow.workspace.id,
        jobName: `${workflow.name} - ${payload.value}`,
        jobRunType: JobRunType.MANUAL,
        targetIds: [payload.id],
      });

      if (!jobHistory) {
        // Every step was filtered out (assets discovery off and nothing but
        // subdomain steps left) or the workflow had no runnable steps.
        this.logger.warn(
          `Workflow ${workflow.id} produced no runnable steps for event "${event}"; nothing was started.`,
        );
      }

      return { workflowId: workflow.id, success: true };
    } catch (error) {
      // Fail-fast surface: include profileId when present so the job-log UI
      // and server logs identify the orphan reference.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Trigger failed for workflow ${workflow.id} (profileId=${firstProfileId}): ${message}`,
      );
      return { workflowId: workflow.id, success: false, error: message };
    }
  }

  /**
   * Get workflow by event
   * @param event Event name
   * @returns Workflow object
   */
  private async getWorkflowByEvent(event: string, payload: Target) {
    const dotIndex = event.indexOf('.');
    const target = event.substring(0, dotIndex);
    const action = event.substring(dotIndex + 1);
    const workspaceId = await this.workspaceService.getWorkspaceIdByTargetId(
      payload.id,
    );
    return this.dataSource
      .getRepository(Workflow)
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.workspace', 'workspace')
      .where("workflow.content -> 'on' -> :target ? :action", {
        target,
        action,
      })
      .andWhere('workspace.id = :workspaceId', { workspaceId })
      .getOne();
  }
}
