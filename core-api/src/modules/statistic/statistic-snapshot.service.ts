import { DefaultWorkflow, EventTriggerType } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import type { WorkflowRunCompletedPayload } from '../event-bridge/contracts/event-payloads';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import { CreateJobs } from '../jobs-registry/dto/jobs-registry.dto';
import { Job } from '../jobs-registry/entities/job.entity';
import type { RunStepState } from '../workflows/workflow-graph';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Statistic } from './entities/statistic.entity';
import { StatisticService } from './statistic.service';

interface StatisticSnapshot {
  hosts: number;
  ports: number;
  services: number;
  techs: number;
}

/** How many of a run's new hosts the run-completed event names. */
const NEW_HOSTS_PREVIEW = 10;

/**
 * The stored side of statistics: the cron snapshot of every workspace
 * (`calculateAndStoreStatistics`, only rows that changed), and the workflow
 * run listeners. `WORKFLOW_START` snapshots a target's numbers in Redis;
 * `WORKFLOW_END` diffs them, and publishes `workflow.run.completed` with the
 * run outcome and the hosts it found first.
 */
@Injectable()
export class StatisticSnapshotService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly workspacesService: WorkspacesService,
    private readonly eventBridge: EventBridgeService,
    private readonly statistics: StatisticService,
  ) {}

  /**
   * Retrieves all workspace IDs from the database.
   * @returns An array of workspace IDs
   */
  async getWorkspaceIds(): Promise<string[]> {
    const workspaces = await this.dataSource
      .getRepository(Workspace)
      .find({ select: ['id'] });
    return workspaces.map((workspace) => workspace.id);
  }

  /**
   * Saves an array of Statistic objects to the database.
   * @param statistics An array of Statistic objects to save
   */
  async saveStatistics(statistics: Statistic[]): Promise<void> {
    await this.dataSource.getRepository(Statistic).save(statistics);
  }

  /**
   * Handles the cron task to calculate and store statistics.
   * - Fetches all workspaces.
   * - Retrieves counts for assets, targets, vulnerabilities, technologies, and ports for each workspace.
   * - Aggregates the data and saves it to the statistics table.
   */
  async calculateAndStoreStatistics() {
    const workspaceIds = await this.getWorkspaceIds();
    const statistics = await this.statistics.calculateStatistics(workspaceIds);
    if (statistics.length === 0) return;

    const toSave = await this.filterChangedStatistics(statistics);
    if (toSave.length > 0) {
      await this.saveStatistics(toSave);
    }
  }

  /**
   * Filters statistics, keeping only those where at least one numeric field
   * differs from the latest saved record for that workspace.
   * If no previous record exists, the statistic is always kept.
   * Uses DISTINCT ON for a single-query lookup per workspace — efficient
   * even with thousands of workspaces.
   */
  private async filterChangedStatistics(
    statistics: Statistic[],
  ): Promise<Statistic[]> {
    const repo = this.dataSource.getRepository(Statistic);
    const workspaceIds = statistics.map((s) => s.workspace.id);

    if (workspaceIds.length === 0) return [];

    const latestRecords = await repo
      .createQueryBuilder('s')
      .leftJoin('s.workspace', 'workspace')
      .addSelect(['workspace.id'])
      .distinctOn(['s.workspaceId'])
      .where('s.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .orderBy('s.workspaceId', 'ASC')
      .addOrderBy('s.createdAt', 'DESC')
      .getMany();

    const latestMap = new Map(latestRecords.map((r) => [r.workspace.id, r]));

    return statistics.filter((stat) => {
      const latest = latestMap.get(stat.workspace.id);
      if (!latest) return true;

      return (
        latest.assets !== stat.assets ||
        latest.targets !== stat.targets ||
        latest.vuls !== stat.vuls ||
        latest.criticalVuls !== stat.criticalVuls ||
        latest.highVuls !== stat.highVuls ||
        latest.mediumVuls !== stat.mediumVuls ||
        latest.lowVuls !== stat.lowVuls ||
        latest.infoVuls !== stat.infoVuls ||
        latest.techs !== stat.techs ||
        latest.ports !== stat.ports ||
        latest.services !== stat.services ||
        Number(latest.score) !== Number(stat.score)
      );
    });
  }

  async takeSnapshotStatisticTarget(
    targetId: string,
  ): Promise<StatisticSnapshot> {
    const [[footprint], techs] = await Promise.all([
      this.statistics.getServiceFootprintCounts({ targetId }),
      this.statistics.getTechCounts({ targetId }).then((res) =>
        res.length > 0 ? Number(res[0].count) : 0,
      ),
    ]);

    return {
      hosts: Number(footprint?.hosts ?? 0),
      ports: Number(footprint?.ports ?? 0),
      services: Number(footprint?.services ?? 0),
      techs,
    };
  }

  /**
   * Hosts a run found first on a target, counted the way the snapshot counts
   * hosts (only those exposing a service), with a sorted preview of their
   * names. Empty for a run without an id or one that predates provenance.
   */
  async newHostsOfRun(
    jobHistoryId: string | undefined,
    targetId: string,
  ): Promise<{ total: number; sample: string[] }> {
    if (!jobHistoryId) return { total: 0, sample: [] };

    const query = this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .where('asset.jobHistoryId = :jobHistoryId', { jobHistoryId })
      .andWhere('asset.targetId = :targetId', { targetId })
      .andWhere(
        'EXISTS (SELECT 1 FROM asset_services s WHERE s."assetId" = asset.id)',
      );
    const [total, sample] = await Promise.all([
      query.getCount(),
      query
        .clone()
        .select('asset.value', 'value')
        .orderBy('asset.value', 'ASC')
        .limit(NEW_HOSTS_PREVIEW)
        .getRawMany<{ value: string }>(),
    ]);
    return { total, sample: sample.map((row) => row.value) };
  }

  @OnEvent(EventTriggerType.WORKFLOW_START)
  async handleWorkflowStart(job: CreateJobs) {
    const filePath = job.workflow?.filePath;
    if (
      filePath &&
      [
        DefaultWorkflow.DOMAIN_DISCOVERY,
        DefaultWorkflow.IP_ADDRESS_DISCOVERY,
      ].includes(filePath as DefaultWorkflow) &&
      job.targetIds
    ) {
      //Take snapshot
      await Promise.all(
        job.targetIds.map(async (targetId) => {
          const snapshotPayload =
            await this.takeSnapshotStatisticTarget(targetId);
          await this.redisService.setex(
            `snapshot:${filePath}:${targetId}`,
            86400,
            JSON.stringify(snapshotPayload),
          );
        }),
      );
    }
  }

  @OnEvent(EventTriggerType.WORKFLOW_END)
  async handleWorkflowEnd(job: Job) {
    if (
      job.jobHistory?.workflow?.filePath &&
      [
        DefaultWorkflow.DOMAIN_DISCOVERY,
        DefaultWorkflow.IP_ADDRESS_DISCOVERY,
      ].includes(job.jobHistory.workflow.filePath as DefaultWorkflow) &&
      job.asset?.target?.id
    ) {
      const redisKey = `snapshot:${job.jobHistory.workflow.filePath}:${job.asset.target.id}`;

      let beforeSnapshot: StatisticSnapshot = {
        hosts: 0,
        ports: 0,
        services: 0,
        techs: 0,
      };
      try {
        const raw = await this.redisService.get(redisKey);
        if (raw) {
          beforeSnapshot = JSON.parse(raw) as StatisticSnapshot;
        }
      } catch {
        // Corrupted or missing snapshot data — proceed with empty baseline
      }
      await this.redisService.del(redisKey);
      const afterSnapshot = await this.takeSnapshotStatisticTarget(
        job.asset.target.id,
      );

      const diffs: Partial<StatisticSnapshot> = {};
      for (const key in afterSnapshot) {
        const k = key as keyof StatisticSnapshot;
        const before = beforeSnapshot[k] ?? 0;
        const after = afterSnapshot[k];
        if (after > before) {
          diffs[k] = after - before;
        }
      }

      // A run can end without executing its whole graph: a failed step skips
      // every step that needs it. "New assets discovered" would read as "the
      // scan finished", and a run that died with nothing new to report would
      // stay silent — so a run that did not finish reports itself, separately,
      // naming what never ran. (Not a new argument on the discovery message:
      // notifications already stored have no such metadata key, and a missing
      // ICU variable makes the renderer fall back to raw template text.)
      const steps = job.jobHistory?.steps ?? {};
      const idsWith = (predicate: (state: RunStepState) => boolean) =>
        Object.entries(steps)
          .filter(([, state]) => predicate(state))
          .map(([id]) => id);

      const failedSteps = idsWith((state) => state.status === 'failed');
      const blockedSteps = idsWith(
        (state) => state.status === 'skipped' && state.reason === 'blocked-by-failure',
      );
      const cancelledSteps = idsWith(
        (state) => state.status === 'skipped' && state.reason === 'run-cancelled',
      );
      const incomplete =
        failedSteps.length + blockedSteps.length + cancelledSteps.length > 0;

      const members = await this.workspacesService.getMemberOfWorkspaceByJobId(
        job.id,
      );

      // A run belongs to a workspace even when the job row carries no
      // workspaceId of its own; the membership lookup is what resolves it. The
      // event bus requires a workspace on every event, so this is also where an
      // unresolvable run is dropped rather than published with a sentinel.
      if (members.length === 0) return;

      const workspaceId = members[0].workspace.id;
      const newHosts = await this.newHostsOfRun(
        job.jobHistory?.id,
        job.asset.target.id,
      );

      // Publish the run's OUTCOME, not a notification decision. Who gets told
      // what — and in which words — is the consumers' call; this service only
      // reports what happened. Recipients are resolved downstream, which is
      // what lets a member who joins tomorrow start receiving them.
      //
      // `outcome: 'failure'` means "this run did not finish cleanly" — not "the
      // publish failed" — so a partial run is still honest to every consumer.
      await this.eventBridge.publishSafely(
        EVENT_CATALOG.workflow.run.completed,
        {
          workspaceId,
          outcome: incomplete ? 'failure' : 'success',
          resourceType: 'workflow_run',
          resourceId: job.jobHistory?.id,
          payload: {
            targetValue: job.asset.target.value,
            targetId: job.asset.target.id,
            hosts: diffs.hosts ?? 0,
            ports: diffs.ports ?? 0,
            services: diffs.services ?? 0,
            techs: diffs.techs ?? 0,
            // Empty for a clean run; consumers decide whether a non-empty
            // list warrants the "scan stopped halfway" message.
            failedSteps,
            blockedSteps,
            cancelledSteps,
            newHosts: newHosts.sample,
            newHostsTotal: newHosts.total,
          } satisfies WorkflowRunCompletedPayload,
        },
        { subject: `workspace:${workspaceId}/workflow_run:${job.id}` },
      );
    }
  }
}
