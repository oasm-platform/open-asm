import { BullMQName } from '@/common/enums/enum';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  type AssetsAddedJobData,
  type ProjectScheduleJobData,
  ProjectTriggersService,
} from '../project-triggers.service';

/** Cron triggers of project workflows. */
@Processor(BullMQName.PROJECT_WORKFLOW_SCHEDULE)
export class ProjectScheduleConsumer extends WorkerHost {
  private readonly logger = new Logger(ProjectScheduleConsumer.name);

  constructor(private readonly triggers: ProjectTriggersService) {
    super();
  }

  async process(job: Job<ProjectScheduleJobData>): Promise<void> {
    try {
      await this.triggers.fireCron(job.data, job.repeatJobKey);
    } catch (error) {
      // The job is orphaned: its trigger, workflow or project was removed
      // without the BullMQ scheduler. Drop the scheduler instead of letting
      // it fail on every repeat.
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Scheduled project job ${JSON.stringify(job.data)} no longer resolves, removing its scheduler`,
        );
        if (job.repeatJobKey) {
          await this.triggers.removeScheduler(job.repeatJobKey);
        } else {
          await job.remove();
        }
        return;
      }
      throw error;
    }
  }
}

/** "Assets added" batches whose window closed. */
@Processor(BullMQName.PROJECT_TRIGGER_EVENTS)
export class ProjectTriggerEventsConsumer extends WorkerHost {
  constructor(private readonly triggers: ProjectTriggersService) {
    super();
  }

  async process(job: Job<AssetsAddedJobData>): Promise<void> {
    await this.triggers.fireAssetsAdded(job.data.triggerId);
  }
}
