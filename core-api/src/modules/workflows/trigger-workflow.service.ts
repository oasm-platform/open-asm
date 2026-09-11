import { ToolCategory } from '@/common/enums/enum';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Workflow } from './entities/workflow.entity';

export interface TriggerWorkflowResult {
  workflowId: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class TriggerWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(TriggerWorkflowService.name);
  constructor(
    private jobRegistryService: JobsRegistryService,
    private workspaceService: WorkspacesService,
    private toolsService: ToolsService,
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
   * Returns { success, error } instead of swallowing failures — callers
   * (scheduler, webhook) persist the result to the job log.
   */
  async trigger(event: string, payload: Target): Promise<TriggerWorkflowResult> {
    const workflow = await this.getWorkflowByEvent(event, payload);
    if (!workflow) {
      return { workflowId: '', success: true };
    }

    try {
      const workspaceConfig =
        await this.workspaceService.getWorkspaceConfigValue(
          workflow.workspace.id,
        );
      const isAssetsDiscovery = workspaceConfig.isAssetsDiscovery;

      // Resolve all job tool names to build name→category map
      const allJobToolNames = workflow.content.jobs
        .map((j) => j.run)
        .filter(Boolean);
      if (allJobToolNames.length === 0) {
        const error = 'Workflow does not have any jobs defined.';
        this.logger.warn(
          `Trigger failed for workflow ${workflow.id}: ${error}`,
        );
        return { workflowId: workflow.id, success: false, error };
      }

      const tools = await this.toolsService.getToolByNames({
        names: allJobToolNames,
      });
      const toolMap = new Map(tools.map((t) => [t.name, t]));

      // When assets discovery is off, skip SUBDOMAINS jobs
      let startIndex = 0;
      if (!isAssetsDiscovery) {
        startIndex = workflow.content.jobs.findIndex((j) => {
          const tool = toolMap.get(j.run);
          return tool && tool.category !== ToolCategory.SUBDOMAINS;
        });
        if (startIndex === -1) {
          this.logger.warn(
            'Asset discovery disabled and all jobs are SUBDOMAINS. Skipping workflow.',
          );
          return { workflowId: workflow.id, success: true };
        }
      }

      const startJob = workflow.content.jobs[startIndex];
      const tool = toolMap.get(startJob.run);
      if (!tool) {
        const error = `Tool "${startJob.run}" not found.`;
        this.logger.warn(
          `Trigger failed for workflow ${workflow.id}: ${error}`,
        );
        return { workflowId: workflow.id, success: false, error };
      }

      await this.jobRegistryService.createNewJob({
        tool,
        config: startJob?.config,
        configProfileId: startJob?.configProfileId,
        targetIds: [payload.id],
        workflow,
        priority: tool.priority,
        workspaceId: workflow.workspace.id,
        jobName: `${workflow.name} - ${payload.value}`,
      });

      return { workflowId: workflow.id, success: true };
    } catch (error) {
      // Fail-fast surface: include profileId when present so the job-log UI
      // and server logs identify the orphan reference.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Trigger failed for workflow ${workflow.id} (profileId=${workflow.content.jobs[0]?.configProfileId ?? 'none'}): ${message}`,
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
