import { BullMQName, JobRunType, ProjectTriggerType } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type {
  AssetsAddedTriggerConfigDto,
  CreateProjectTriggerDto,
  UpdateProjectTriggerDto,
} from './dto/project-trigger.dto';
import { Project } from './entities/project.entity';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import {
  type AssetsAddedTriggerConfig,
  ProjectWorkflowTrigger,
} from './entities/project-workflow-trigger.entity';
import { findProjectOrFail } from './project-access';
import { ProjectWorkflowsService } from './project-workflows.service';

export const DEFAULT_WINDOW_MINUTES = 10;
export const DEFAULT_MAX_ASSETS = 200;

/** Payload of a cron scheduler job: the trigger, or a pre-trigger binding. */
export interface ProjectScheduleJobData {
  triggerId?: string;
  /** Binding id carried by schedulers registered before triggers existed. */
  id?: string;
}

export interface AssetsAddedJobData {
  triggerId: string;
}

const pendingKey = (triggerId: string) =>
  `project-trigger:${triggerId}:pending`;
const queuedKey = (triggerId: string) => `project-trigger:${triggerId}:queued`;
/** How long gathered asset ids survive if their batch job is lost. */
const PENDING_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Applies the defaults and bounds of an `assets_added` config. */
export function normalizeAssetsAddedConfig(
  config: AssetsAddedTriggerConfigDto | AssetsAddedTriggerConfig | undefined,
): AssetsAddedTriggerConfig {
  return {
    windowMinutes: config?.windowMinutes ?? DEFAULT_WINDOW_MINUTES,
    maxAssets: config?.maxAssets ?? DEFAULT_MAX_ASSETS,
    targetTypes: config?.targetTypes ?? [],
  };
}

/** Splits ids into runs of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * When project workflows run on their own.
 *
 * Cron triggers are BullMQ job schedulers on the project schedule queue (its
 * value predates the rename; see {@link BullMQName.PROJECT_WORKFLOW_SCHEDULE}).
 * "Assets added" triggers gather the assets that joined the project in a Redis
 * set and start one run when the window closes: discovery that finds 500
 * subdomains must not start 500 runs.
 */
@Injectable()
export class ProjectTriggersService {
  private readonly logger = new Logger(ProjectTriggersService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectWorkflow)
    private readonly bindingRepo: Repository<ProjectWorkflow>,
    @InjectRepository(ProjectWorkflowTrigger)
    private readonly triggerRepo: Repository<ProjectWorkflowTrigger>,
    @InjectQueue(BullMQName.PROJECT_WORKFLOW_SCHEDULE)
    private readonly scheduleQueue: Queue<ProjectScheduleJobData>,
    @InjectQueue(BullMQName.PROJECT_TRIGGER_EVENTS)
    private readonly eventsQueue: Queue<AssetsAddedJobData>,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
    private readonly workflows: ProjectWorkflowsService,
  ) {}

  async list(
    projectId: string,
    workspaceId: string,
  ): Promise<ProjectWorkflowTrigger[]> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    return this.triggerRepo
      .createQueryBuilder('trigger')
      .innerJoin('trigger.projectWorkflow', 'binding')
      .where('binding.projectId = :projectId', { projectId })
      .orderBy('trigger.createdAt', 'ASC')
      .getMany();
  }

  /**
   * Adds a trigger to one of the project's workflows. A cron needs a cron
   * expression; a workflow has at most one "assets added" trigger (two would
   * scan every new asset twice).
   */
  async create(
    projectId: string,
    workspaceId: string,
    dto: CreateProjectTriggerDto,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ProjectWorkflowTrigger> {
    const project = await findProjectOrFail(
      manager.getRepository(Project),
      projectId,
      workspaceId,
      { writable: true },
    );
    const binding = await manager
      .getRepository(ProjectWorkflow)
      .findOne({ where: { id: dto.projectWorkflowId, projectId } });
    if (!binding) {
      throw new NotFoundException(
        `Project workflow "${dto.projectWorkflowId}" not found`,
      );
    }

    if (dto.type === ProjectTriggerType.CRON) {
      assertCron(dto.cron);
    } else {
      const existing = await manager.getRepository(ProjectWorkflowTrigger).count({
        where: {
          projectWorkflowId: binding.id,
          type: ProjectTriggerType.ASSETS_ADDED,
        },
      });
      if (existing > 0) {
        throw new BadRequestException(
          'This workflow already runs when assets are added',
        );
      }
    }

    const trigger = await manager.getRepository(ProjectWorkflowTrigger).save(
      manager.getRepository(ProjectWorkflowTrigger).create({
        projectWorkflowId: binding.id,
        type: dto.type,
        cron: dto.type === ProjectTriggerType.CRON ? dto.cron!.trim() : null,
        config:
          dto.type === ProjectTriggerType.ASSETS_ADDED
            ? normalizeAssetsAddedConfig(dto.config)
            : {},
        enabled: dto.enabled ?? true,
      }),
    );
    if (!project.archivedAt) {
      await this.register(trigger, manager);
    }
    return trigger;
  }

  async update(
    projectId: string,
    workspaceId: string,
    triggerId: string,
    dto: UpdateProjectTriggerDto,
  ): Promise<ProjectWorkflowTrigger> {
    const project = await findProjectOrFail(
      this.projectRepo,
      projectId,
      workspaceId,
      { writable: true },
    );
    const trigger = await this.findTrigger(projectId, triggerId);

    if (dto.cron !== undefined) {
      if (trigger.type !== ProjectTriggerType.CRON) {
        throw new BadRequestException('Only a cron trigger has a schedule');
      }
      assertCron(dto.cron);
      trigger.cron = dto.cron.trim();
    }
    if (dto.config !== undefined) {
      if (trigger.type !== ProjectTriggerType.ASSETS_ADDED) {
        throw new BadRequestException('Only an "assets added" trigger has settings');
      }
      trigger.config = normalizeAssetsAddedConfig({
        ...trigger.config,
        ...dto.config,
      });
    }
    if (dto.enabled !== undefined) trigger.enabled = dto.enabled;

    await this.unregister(trigger);
    const saved = await this.triggerRepo.save(trigger);
    if (!project.archivedAt) await this.register(saved);
    return saved;
  }

  async remove(
    projectId: string,
    workspaceId: string,
    triggerId: string,
  ): Promise<void> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    const trigger = await this.findTrigger(projectId, triggerId);
    await this.unregister(trigger);
    await this.clearPending(trigger.id);
    await this.triggerRepo.delete(trigger.id);
  }

  /** Registers the cron schedulers of every enabled trigger of the project. */
  async registerProject(projectId: string): Promise<void> {
    for (const trigger of await this.triggersOfProject(projectId)) {
      await this.register(trigger);
    }
  }

  /**
   * Unregisters every scheduler of the project (or of one binding) and drops
   * gathered assets. Trigger rows and their settings are kept.
   */
  async unregisterProject(
    projectId: string,
    bindingId?: string,
  ): Promise<void> {
    for (const trigger of await this.triggersOfProject(projectId, bindingId)) {
      await this.unregister(trigger);
      await this.clearPending(trigger.id);
    }
  }

  /**
   * A cron scheduler fired. Resolves the trigger (schedulers registered
   * before triggers existed carry the binding id instead) and runs the
   * workflow on the whole scope. A disabled trigger or archived project only
   * has its scheduler removed. Throws NotFound when nothing resolves, which
   * the consumer turns into removing the orphaned scheduler.
   */
  async fireCron(
    data: ProjectScheduleJobData,
    repeatJobKey?: string | null,
  ): Promise<void> {
    const trigger = await this.resolveCronTrigger(data, repeatJobKey);
    if (!trigger) {
      throw new NotFoundException(
        `No project trigger for scheduled job ${JSON.stringify(data)}`,
      );
    }
    const binding = await this.workflows.findBinding(
      trigger.projectWorkflow.projectId,
      trigger.projectWorkflowId,
    );
    if (!data.triggerId) {
      // A scheduler from before triggers existed: replace it with one keyed
      // by the trigger, so the next fire resolves directly.
      if (repeatJobKey && repeatJobKey !== trigger.schedulerId) {
        await this.scheduleQueue.removeJobScheduler(repeatJobKey);
      }
      await this.unregister(trigger);
      if (trigger.enabled && !binding.project.archivedAt) {
        await this.register(trigger);
      }
    }
    if (!trigger.enabled || binding.project.archivedAt) {
      await this.unregister(trigger);
      return;
    }

    await this.markFired(trigger.id);
    await this.workflows.startBindingRun(binding, {
      jobRunType: JobRunType.SCHEDULED,
      triggerId: trigger.id,
    });
  }

  /**
   * Assets joined the project (by hand, by a rule edit or by discovery).
   * Each enabled "assets added" trigger gathers them and, when no batch is
   * open yet, opens one that closes after its window.
   */
  async onAssetsAdded(projectId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) return;
    const triggers = await this.triggerRepo
      .createQueryBuilder('trigger')
      .innerJoin('trigger.projectWorkflow', 'binding')
      .innerJoin('binding.project', 'project')
      .where('binding.projectId = :projectId', { projectId })
      .andWhere('trigger.type = :type', { type: ProjectTriggerType.ASSETS_ADDED })
      .andWhere('trigger.enabled = true')
      .andWhere('project.archivedAt IS NULL')
      .getMany();

    for (const trigger of triggers) {
      const config = normalizeAssetsAddedConfig(trigger.config);
      const delay = (config.windowMinutes ?? 0) * 60_000;
      await this.redis.client
        .multi()
        .sadd(pendingKey(trigger.id), ...assetIds)
        .expire(pendingKey(trigger.id), PENDING_TTL_SECONDS)
        .exec();
      // One open batch per trigger: the flag outlives the window, and the
      // batch clears it before draining, so ids added while it drains open
      // the next batch instead of being stranded.
      const opened = await this.redis.client.set(
        queuedKey(trigger.id),
        '1',
        'EX',
        Math.ceil(delay / 1000) + 3600,
        'NX',
      );
      if (opened !== 'OK') continue;
      await this.eventsQueue.add(
        'assets-added',
        { triggerId: trigger.id },
        { delay, removeOnComplete: true, removeOnFail: 100 },
      );
    }
  }

  /**
   * A batch window closed: drains the gathered assets and starts one run per
   * `maxAssets` of them that are still in the project (and of the configured
   * target types).
   */
  async fireAssetsAdded(triggerId: string): Promise<void> {
    await this.redis.client.del(queuedKey(triggerId));
    const result = await this.redis.client
      .multi()
      .smembers(pendingKey(triggerId))
      .del(pendingKey(triggerId))
      .exec();
    const gathered = (result?.[0]?.[1] as string[] | undefined) ?? [];

    const trigger = await this.triggerRepo.findOne({
      where: { id: triggerId },
      relations: { projectWorkflow: true },
    });
    if (!trigger?.enabled || trigger.type !== ProjectTriggerType.ASSETS_ADDED) {
      return;
    }
    const binding = await this.workflows.findBinding(
      trigger.projectWorkflow.projectId,
      trigger.projectWorkflowId,
    );
    if (binding.project.archivedAt || gathered.length === 0) return;

    const config = normalizeAssetsAddedConfig(trigger.config);
    const rows: Array<{ assetId: string }> = await this.dataSource.query(
      `SELECT pa."assetId"
         FROM project_assets pa
         JOIN assets a ON a.id = pa."assetId"
         JOIN targets t ON t.id = a."targetId"
        WHERE pa."projectId" = $1
          AND pa."assetId" = ANY($2::uuid[])
          AND (cardinality($3::text[]) = 0 OR t.type = ANY($3::text[]))`,
      [binding.projectId, gathered, config.targetTypes ?? []],
    );
    const assetIds = rows.map((row) => row.assetId);
    if (assetIds.length === 0) return;

    await this.markFired(trigger.id);
    for (const ids of chunk(assetIds, config.maxAssets ?? DEFAULT_MAX_ASSETS)) {
      try {
        await this.workflows.startBindingRun(binding, {
          jobRunType: JobRunType.EVENT,
          triggerId: trigger.id,
          assetIds: ids,
        });
      } catch (error) {
        // One unrunnable batch (a root tool uninstalled since) must not drop
        // the others: log it, the run list shows nothing started.
        this.logger.warn(
          `Assets-added run of trigger ${trigger.id} not started: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Drops a scheduler nothing resolves to any more. */
  async removeScheduler(schedulerId: string): Promise<void> {
    await this.scheduleQueue.removeJobScheduler(schedulerId);
  }

  private async resolveCronTrigger(
    data: ProjectScheduleJobData,
    repeatJobKey?: string | null,
  ): Promise<ProjectWorkflowTrigger | null> {
    const relations = { projectWorkflow: true };
    if (data.triggerId) {
      return this.triggerRepo.findOne({
        where: { id: data.triggerId, type: ProjectTriggerType.CRON },
        relations,
      });
    }
    if (!data.id) return null;
    const candidates = await this.triggerRepo.find({
      where: { projectWorkflowId: data.id, type: ProjectTriggerType.CRON },
      relations,
      order: { createdAt: 'ASC' },
    });
    // The migration made exactly one cron trigger per scheduled binding, so a
    // lone candidate is that scheduler's trigger even if the key format moved.
    return (
      candidates.find((t) => repeatJobKey && t.schedulerId === repeatJobKey) ??
      (candidates.length === 1 ? candidates[0] : null)
    );
  }

  private async register(
    trigger: ProjectWorkflowTrigger,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    if (trigger.type !== ProjectTriggerType.CRON) return;
    if (!trigger.enabled || !trigger.cron) return;
    const schedulerId = `project-trigger:${trigger.id}`;
    await this.scheduleQueue.upsertJobScheduler(
      schedulerId,
      { pattern: trigger.cron },
      { name: trigger.id, data: { triggerId: trigger.id } },
    );
    trigger.schedulerId = schedulerId;
    await manager.update(ProjectWorkflowTrigger, { id: trigger.id }, { schedulerId });
  }

  private async unregister(trigger: ProjectWorkflowTrigger): Promise<void> {
    if (!trigger.schedulerId) return;
    await this.scheduleQueue.removeJobScheduler(trigger.schedulerId);
    trigger.schedulerId = null;
    await this.triggerRepo.update({ id: trigger.id }, { schedulerId: null });
  }

  private async clearPending(triggerId: string): Promise<void> {
    await this.redis.client.del(pendingKey(triggerId), queuedKey(triggerId));
  }

  private async markFired(triggerId: string): Promise<void> {
    await this.triggerRepo.update({ id: triggerId }, { lastFiredAt: new Date() });
  }

  private async findTrigger(
    projectId: string,
    triggerId: string,
  ): Promise<ProjectWorkflowTrigger> {
    const trigger = await this.triggerRepo
      .createQueryBuilder('trigger')
      .innerJoin('trigger.projectWorkflow', 'binding')
      .where('trigger.id = :triggerId', { triggerId })
      .andWhere('binding.projectId = :projectId', { projectId })
      .getOne();
    if (!trigger) {
      throw new NotFoundException(`Trigger "${triggerId}" not found`);
    }
    return trigger;
  }

  private triggersOfProject(
    projectId: string,
    bindingId?: string,
  ): Promise<ProjectWorkflowTrigger[]> {
    const qb = this.triggerRepo
      .createQueryBuilder('trigger')
      .innerJoin('trigger.projectWorkflow', 'binding')
      .where('binding.projectId = :projectId', { projectId });
    if (bindingId) qb.andWhere('binding.id = :bindingId', { bindingId });
    return qb.getMany();
  }
}

/** A cron trigger needs a real expression; "disabled" is `enabled: false`. */
function assertCron(cron: string | undefined): void {
  if (!cron || cron.trim() === 'disabled') {
    throw new BadRequestException(
      'A cron trigger needs a cron expression; disable the trigger to stop it',
    );
  }
}
