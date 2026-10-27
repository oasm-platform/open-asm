import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  DefaultWorkflow,
  EventTriggerType,
  JobRunType,
  TargetType,
} from '@/common/enums/enum';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import type { UrlDiscoveredPayload } from '../event-bridge/contracts/event-payloads';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { Job } from '../jobs-registry/entities/job.entity';
import { WorkflowRunnerService } from '../jobs-registry/workflow-runner.service';
import { Target } from '../targets/entities/target.entity';
import { WorkflowsService } from '../workflows/workflows.service';
import { DiscoveredUrl } from './entities/discovered-url.entity';

/** How many of a run's new URLs one notification previews. */
const URL_PREVIEW = 10;

@Injectable()
export class UrlDiscoveryService {
  private readonly logger = new Logger(UrlDiscoveryService.name);

  constructor(
    @InjectRepository(Target)
    private readonly targetRepo: Repository<Target>,
    @InjectRepository(DiscoveredUrl)
    private readonly discoveredUrlRepo: Repository<DiscoveredUrl>,
    private readonly workflowsService: WorkflowsService,
    private readonly workflowRunnerService: WorkflowRunnerService,
    private readonly eventBridge: EventBridgeService,
  ) {}

  /**
   * Runs the whole `url_discovery` workflow on the given domain targets.
   * Results are stored in `discovered_urls` by the URL_DISCOVERY ingest, like
   * any other run.
   *
   * @param targetIds - The IDs of the targets to discover URLs for.
   * @returns A message indicating whether the discovery has started.
   */
  public async discover(
    targetIds: string[],
    workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const targets = await this.targetRepo.find({
      where: { id: In(targetIds), workspaceId },
      select: { id: true, type: true, value: true },
    });
    if (targets.length === 0) {
      throw new NotFoundException('No targets found in the workspace.');
    }

    // The URL discovery connectors only accept domain targets: an IP or CIDR
    // target would start a run in which every step is skipped.
    const domains = targets.filter((t) => t.type === TargetType.DOMAIN);
    if (domains.length === 0) {
      throw new BadRequestException(
        'URL discovery supports domain targets only.',
      );
    }

    const workflow = await this.workflowsService.workflowRepository.findOne({
      where: {
        workspace: { id: workspaceId },
        filePath: DefaultWorkflow.URL_DISCOVERY,
      },
    });
    if (!workflow) {
      throw new NotFoundException(
        `Workflow ${DefaultWorkflow.URL_DISCOVERY} not found in the workspace.`,
      );
    }

    const { dispatched } = await this.workflowRunnerService.startRun({
      workflow,
      workspaceId,
      jobName:
        domains.length === 1
          ? `${workflow.name} - ${domains[0].value}`
          : `${workflow.name} - ${domains.length} targets`,
      jobRunType: JobRunType.MANUAL,
      targetIds: domains.map((t) => t.id),
    });

    // Jobs only go to services httpx confirmed live, so a target that has not
    // finished discovery yields none.
    if (dispatched === 0) {
      return {
        message: 'No live HTTP services found. Run asset discovery first.',
      };
    }
    return { message: `Discovering URLs on ${domains.length} target(s)...` };
  }

  /**
   * Publishes `asset.url.discovered` for every target of a finished
   * url_discovery run that gained URLs. The ingest skips a URL a service
   * already has, so a row keeps the run that first stored it: the run's own
   * rows are exactly its new URLs.
   */
  @OnEvent(EventTriggerType.WORKFLOW_END)
  async handleRunEnd(job: Job): Promise<void> {
    const run = job?.jobHistory;
    const filePath = run?.workflow?.filePath as DefaultWorkflow | undefined;
    if (!run?.id || filePath !== DefaultWorkflow.URL_DISCOVERY) return;

    try {
      // Bounded by the run's scope: `jobHistoryId` has no index of its own,
      // while the join from the scope's assets walks indexed columns.
      const scope = run.scope ?? {};
      const query = this.discoveredUrlRepo
        .createQueryBuilder('du')
        .innerJoin('du.assetService', 'service')
        .innerJoin('service.asset', 'asset')
        .innerJoin('asset.target', 'target')
        .where('du.jobHistoryId = :runId', { runId: run.id });
      if (scope.targetIds?.length) {
        query.andWhere('target.id IN (:...targetIds)', {
          targetIds: scope.targetIds,
        });
      } else if (scope.assetIds?.length) {
        query.andWhere('asset.id IN (:...assetIds)', {
          assetIds: scope.assetIds,
        });
      } else {
        return;
      }

      const perTarget = await query
        .clone()
        .select('target.id', 'targetId')
        .addSelect('target.value', 'targetValue')
        .addSelect('target.workspaceId', 'workspaceId')
        .addSelect('COUNT(*)', 'count')
        .groupBy('target.id')
        .addGroupBy('target.value')
        .addGroupBy('target.workspaceId')
        .getRawMany<{
          targetId: string;
          targetValue: string;
          workspaceId: string;
          count: string;
        }>();

      for (const row of perTarget) {
        const count = Number(row.count);
        if (!count) continue;

        const preview = await query
          .clone()
          .andWhere('target.id = :targetId', { targetId: row.targetId })
          .select('du.url', 'url')
          .orderBy('du.url', 'ASC')
          .limit(URL_PREVIEW)
          .getRawMany<{ url: string }>();

        await this.eventBridge.publishSafely(
          EVENT_CATALOG.asset.url.discovered,
          {
            workspaceId: row.workspaceId,
            outcome: 'success',
            resourceType: 'workflow_run',
            resourceId: run.id,
            payload: {
              jobHistoryId: run.id,
              targetId: row.targetId,
              targetValue: row.targetValue,
              count,
              urls: preview.map((p) => p.url),
            } satisfies UrlDiscoveredPayload,
          },
          { subject: `workspace:${row.workspaceId}/workflow_run:${run.id}` },
        );
      }
    } catch (error) {
      // An event listener must never throw into the emitter.
      this.logger.error(
        `Failed to report new URLs of run ${run.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
