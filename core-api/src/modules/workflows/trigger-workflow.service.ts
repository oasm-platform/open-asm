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
            const firstJobs = Object.keys(workflow.content.jobs);
            const tools = await this.toolsService.getToolByNames(firstJobs);
            await Promise.all(tools.map(tool => this.jobRegistryService.createNewJob({
              tool,
              targetIds: [payload.id],
              workflow: workflow,
              priority: tool.priority,
            })));
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
      .where("workflow.content -> 'on' -> :target @> :action", {
        target,
        action: JSON.stringify([action]),
      })
      .getOne();
  }
}
