import { AuditActorType, AuditOutcome, EventTriggerType } from '@/common/enums/enum';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import type { ProjectRunCompletedPayload } from '../event-bridge/contracts/event-payloads';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { Job } from '../jobs-registry/entities/job.entity';
import { Project } from './entities/project.entity';
import { runOutcomeOf } from './project-triggers.service';

/**
 * Reports every finished project run as `project.run.completed`, the event
 * `on: project.run.completed` triggers run on. A cancelled run never
 * finishes this way (the user stopped it), so it starts nothing.
 */
@Injectable()
export class ProjectRunEventsListener {
  private readonly logger = new Logger(ProjectRunEventsListener.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly eventBridge: EventBridgeService,
  ) {}

  @OnEvent(EventTriggerType.WORKFLOW_END)
  async onRunEnd(job: Job): Promise<void> {
    const run = job?.jobHistory;
    if (!run?.projectId || !run.projectWorkflowId) return;
    try {
      const project = await this.projectRepo.findOne({
        where: { id: run.projectId },
        relations: { workspace: true },
      });
      if (!project?.workspace) return;
      const workspaceId = project.workspace.id;
      await this.eventBridge.publishSafely(
        EVENT_CATALOG.project.run.completed,
        {
          workspaceId,
          outcome: AuditOutcome.Success,
          actor: { type: AuditActorType.System },
          resourceType: 'workflow_run',
          resourceId: run.id,
          payload: {
            projectId: run.projectId,
            projectWorkflowId: run.projectWorkflowId,
            workflowName: run.workflow?.name ?? '',
            jobHistoryId: run.id,
            outcome: runOutcomeOf(run.steps),
          } satisfies ProjectRunCompletedPayload,
        },
        { subject: `workspace:${workspaceId}/project:${run.projectId}` },
      );
    } catch (error) {
      // An event listener must never throw into the emitter.
      this.logger.error(
        `Failed to report the end of project run ${run.id}: ${(error as Error).message}`,
      );
    }
  }
}
