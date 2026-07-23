import { ToolCategory } from '@/common/enums/enum';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Workflow } from './entities/workflow.entity';

@Injectable()
export class TriggerWorkflowService implements OnModuleInit {
  constructor(
    private jobRegistryService: JobsRegistryService,
    private workspaceService: WorkspacesService,
    private toolsService: ToolsService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    // Listen all events with wildcard
    this.eventEmitter.onAny((event: string, payload: Target) => {
      void this.getWorkflowByEvent(event, payload)
        .then(async (workflow: Workflow | null) => {
          if (!workflow) return;

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
            Logger.error('Workflow does not have any jobs defined.');
            return;
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
              Logger.warn(
                'Asset discovery disabled and all jobs are SUBDOMAINS. Skipping workflow.',
              );
              return;
            }
          }

          const startJob = workflow.content.jobs[startIndex];
          const tool = toolMap.get(startJob.run);
          if (!tool) {
            Logger.error(`Tool "${startJob.run}" not found.`);
            return;
          }

          await this.jobRegistryService.createNewJob({
            tool,
            targetIds: [payload.id],
            workflow,
            priority: tool.priority,
            workspaceId: workflow.workspace.id,
            jobName: `${workflow.name} - ${payload.value}`,
          });
        })
        .catch((error) => {
          // Handle error, e.g., log it
          Logger.error('Error in onModuleInit:', error);
        });
    });
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
