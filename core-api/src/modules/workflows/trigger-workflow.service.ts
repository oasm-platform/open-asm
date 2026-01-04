import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ToolsService } from '../tools/tools.service';
import { Workflow } from './entities/workflow.entity';

@Injectable()
export class TriggerWorkflowService implements OnModuleInit {
  constructor(
    private jobRegistryService: JobsRegistryService,
    private toolsService: ToolsService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) { }

  onModuleInit() {
    // Listen all events with wildcard
    this.eventEmitter.onAny((event: string, payload: Target) => {
      this.getWorkflowByEvent(event)
        .then(async (workflow: Workflow | null) => {
          if (workflow) {
            // Get the first job's tool name
            const firstJobToolName = workflow.content.jobs[0]?.run;

            if (!firstJobToolName) {
              Logger.error('Workflow does not have any jobs defined.');
              return;
            }

            const tools = await this.toolsService.getToolByNames({
              names: [firstJobToolName],
            });

            if (!tools || tools.length === 0) {
              Logger.error(`Tool "${firstJobToolName}" not found.`);
              return;
            }

            // Only use the first tool found (should be exactly one)
            const tool = tools[0];

            await this.jobRegistryService.createNewJob({
              tool,
              targetIds: [payload.id],
              workflow: workflow,
              priority: tool.priority,
              workspaceId: workflow.workspace.id,
            });
          }
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
  private async getWorkflowByEvent(event: string) {
    const [target, action] = event.split('.');
    return this.dataSource
      .getRepository(Workflow)
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.workspace', 'workspace')
      .where("workflow.content -> 'on' -> :target ? :action", {
        target,
        action,
      })
      .getOne();
  }
}
