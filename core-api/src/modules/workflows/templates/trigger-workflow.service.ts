import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobsRegistryService } from 'src/modules/jobs-registry/jobs-registry.service';
import { Target } from 'src/modules/targets/entities/target.entity';
import { DataSource } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';

@Injectable()
export class TriggerWorkflowService implements OnModuleInit {
  constructor(
    private jobRegistryService: JobsRegistryService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    // Listen all events with wildcard
    this.eventEmitter.onAny(async (event: string, payload: Target) => {
      const workflow = await this.getWorkflowByEvent(event);

      if (workflow) {
        const firstJobs = Object.keys(workflow.content.jobs);
        await this.jobRegistryService.createJob({
          toolNames: firstJobs,
          target: payload,
          workflow,
        });
      }
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
      .where(`workflow.content -> 'on' -> :target @> :action`, {
        target,
        action: JSON.stringify([action]),
      })
      .getOne();
  }
}
