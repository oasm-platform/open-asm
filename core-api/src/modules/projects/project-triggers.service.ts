import { BullMQName, JobRunType, ProjectTriggerType } from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Workflow, type WorkflowContent } from '../workflows/entities/workflow.entity';
import type {
  CreateProjectTriggerDto,
  UpdateProjectTriggerDto,
} from './dto/project-trigger.dto';
import { Project } from './entities/project.entity';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import { ProjectWorkflowTrigger } from './entities/project-workflow-trigger.entity';
import { isProjectOwnedWorkflow } from './pipeline';
import { findProjectOrFail } from './project-access';
import { ProjectWorkflowsService } from './project-workflows.service';
import {
  ASSETS_ADDED_KEY,
  cronKey,
  type DefinedTrigger,
  DEFAULT_MAX_ASSETS,
  keyOfRow,
  normalizeAssetsAddedConfig,
  onOfTriggers,
  planTriggerSync,
  triggersOfOn,
  WorkflowOnError,
} from './workflow-on';


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
 * A workflow's triggers are defined in its file (`on:`, see workflow-on.ts);
 * `project_workflow_triggers` keeps one row per entry with its state.
 * Cron triggers are BullMQ job schedulers on the project schedule queue (its
 * value predates the rename; see {@link BullMQName.PROJECT_WORKFLOW_SCHEDULE}).
 * "Assets added" triggers gather the assets that joined the project in a Redis
 * set and start one run when the window closes: discovery that finds 500
 * subdomains must not start 500 runs.
 */
@Injectable()
export class ProjectTriggersService implements OnApplicationBootstrap {
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
   * Adds a trigger to one of the project's workflows, by writing it into the
   * workflow's `on:` block (the file is the definition, see workflow-on.ts).
   * A cron needs a cron expression; a workflow has at most one "assets added"
   * trigger (two would scan every new asset twice).
   */
  async create(
    projectId: string,
    workspaceId: string,
    dto: CreateProjectTriggerDto,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ProjectWorkflowTrigger> {
    await findProjectOrFail(manager.getRepository(Project), projectId, workspaceId, {
      writable: true,
    });
    const binding = await this.bindingWithWorkflow(projectId, dto.projectWorkflowId, manager);

    let added: DefinedTrigger;
    if (dto.type === ProjectTriggerType.CRON) {
      assertCron(dto.cron);
      const cron = dto.cron!.trim();
      added = { key: cronKey(cron), type: ProjectTriggerType.CRON, cron };
    } else {
      added = {
        key: ASSETS_ADDED_KEY,
        type: ProjectTriggerType.ASSETS_ADDED,
        config: normalizeAssetsAddedConfig(dto.config),
      };
    }
    await this.writeOn(binding, manager, (defined) => {
      if (defined.some((t) => t.key === added.key)) {
        throw new BadRequestException(
          added.type === ProjectTriggerType.CRON
            ? 'This workflow already runs on this schedule'
            : 'This workflow already runs when assets are added',
        );
      }
      return [...defined, added];
    });

    const rows = await this.syncWorkflow(binding.id, manager);
    const trigger = rows.find((row) => keyOfRow(row) === added.key)!;
    if (dto.enabled === false) {
      trigger.enabled = false;
      await this.unregister(trigger, manager);
      await manager.getRepository(ProjectWorkflowTrigger).save(trigger);
    }
    return trigger;
  }

  /**
   * Changes a trigger. Its schedule and settings live in the workflow file;
   * whether it is on lives in the table, like disabling a workflow on GitHub.
   */
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
    let trigger = await this.findTrigger(projectId, triggerId);
    const binding = await this.bindingWithWorkflow(projectId, trigger.projectWorkflowId);

    if (dto.cron !== undefined) {
      if (trigger.type !== ProjectTriggerType.CRON) {
        throw new BadRequestException('Only a cron trigger has a schedule');
      }
      assertCron(dto.cron);
      const cron = dto.cron.trim();
      const oldKey = keyOfRow(trigger);
      await this.writeOn(binding, this.dataSource.manager, (defined) => {
        if (cronKey(cron) !== oldKey && defined.some((t) => t.key === cronKey(cron))) {
          throw new BadRequestException('This workflow already runs on this schedule');
        }
        return defined.map((t) =>
          t.key === oldKey ? { key: cronKey(cron), type: t.type, cron } : t,
        );
      });
      // The row follows its entry, so it keeps its id, state and history.
      await this.unregister(trigger);
      trigger.cron = cron;
      trigger = await this.triggerRepo.save(trigger);
    }
    if (dto.config !== undefined) {
      if (trigger.type !== ProjectTriggerType.ASSETS_ADDED) {
        throw new BadRequestException('Only an "assets added" trigger has settings');
      }
      const config = normalizeAssetsAddedConfig({ ...trigger.config, ...dto.config });
      await this.writeOn(binding, this.dataSource.manager, (defined) =>
        defined.map((t) => (t.key === ASSETS_ADDED_KEY ? { ...t, config } : t)),
      );
    }
    if (dto.enabled !== undefined) {
      trigger.enabled = dto.enabled;
      trigger = await this.triggerRepo.save(trigger);
    }

    await this.syncWorkflow(binding.id);
    const saved = await this.findTrigger(projectId, triggerId);
    await this.unregister(saved);
    if (!project.archivedAt) await this.register(saved);
    return saved;
  }

  /** Removes a trigger from its workflow's file, and its row with it. */
  async remove(
    projectId: string,
    workspaceId: string,
    triggerId: string,
  ): Promise<void> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    const trigger = await this.findTrigger(projectId, triggerId);
    const binding = await this.bindingWithWorkflow(projectId, trigger.projectWorkflowId);
    const key = keyOfRow(trigger);
    await this.writeOn(binding, this.dataSource.manager, (defined) =>
      defined.filter((t) => t.key !== key),
    );
    await this.syncWorkflow(binding.id);
  }

  /**
   * Brings a workflow's trigger rows in line with its `on:` block: entries
   * new to the file get a row (on) and a scheduler, rows whose entry left the
   * file go with their scheduler, changed settings are copied. Rows that stay
   * keep whether they are on and when they last fired.
   *
   * @returns the workflow's trigger rows after the sync
   */
  async syncWorkflow(
    bindingId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ProjectWorkflowTrigger[]> {
    const binding = await manager.getRepository(ProjectWorkflow).findOne({
      where: { id: bindingId },
      relations: { workflow: true, project: true },
    });
    if (!binding) throw new NotFoundException(`Project workflow "${bindingId}" not found`);
    const repo = manager.getRepository(ProjectWorkflowTrigger);
    const rows = await repo.find({
      where: { projectWorkflowId: bindingId },
      order: { createdAt: 'ASC' },
    });
    const plan = planTriggerSync(rows, this.definedTriggers(binding));

    for (const row of plan.remove) {
      await this.unregister(row, manager);
      await this.clearPending(row.id);
      await repo.delete(row.id);
    }
    for (const { row, config } of plan.update) {
      row.config = config;
      await repo.save(row);
    }
    for (const defined of plan.create) {
      const row = await repo.save(
        repo.create({
          projectWorkflowId: bindingId,
          type: defined.type,
          cron: defined.cron ?? null,
          config: defined.config ?? {},
          enabled: true,
        }),
      );
      if (!binding.project.archivedAt) await this.register(row, manager);
    }
    return repo.find({
      where: { projectWorkflowId: bindingId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Startup check that BullMQ matches the database: every workflow's rows
   * follow its file, every enabled cron trigger of an active project has its
   * scheduler, and no scheduler is left without one. Lost Redis data (a flush,
   * a new instance) would otherwise stop the schedules silently. Each step is
   * idempotent, so replicas booting together do no harm.
   */
  async reconcileSchedulers(): Promise<{ registered: number; removed: number }> {
    const bindings = await this.bindingRepo.find({ select: { id: true } });
    for (const binding of bindings) {
      try {
        await this.syncWorkflow(binding.id);
      } catch (error) {
        this.logger.warn(
          `Triggers of project workflow ${binding.id} not synced: ${(error as Error).message}`,
        );
      }
    }

    const triggers = await this.triggerRepo.find({
      where: { type: ProjectTriggerType.CRON },
      relations: { projectWorkflow: { project: true } },
    });
    const wanted = new Set<string>();
    let registered = 0;
    for (const trigger of triggers) {
      if (trigger.enabled && trigger.cron && !trigger.projectWorkflow.project.archivedAt) {
        await this.register(trigger);
        wanted.add(trigger.schedulerId!);
        registered++;
      } else if (trigger.schedulerId) {
        await this.unregister(trigger);
      }
    }

    let removed = 0;
    for (const scheduler of await this.scheduleQueue.getJobSchedulers(0, -1)) {
      if (wanted.has(scheduler.key)) continue;
      await this.scheduleQueue.removeJobScheduler(scheduler.key);
      removed++;
    }
    return { registered, removed };
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const { registered, removed } = await this.reconcileSchedulers();
      this.logger.log(
        `Project schedules: ${registered} registered, ${removed} orphaned scheduler(s) removed`,
      );
    } catch (error) {
      // Best effort: a broken Redis must not stop the API from booting.
      this.logger.warn(`Project schedules not reconciled: ${(error as Error).message}`);
    }
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

  private async unregister(
    trigger: ProjectWorkflowTrigger,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    if (!trigger.schedulerId) return;
    await this.scheduleQueue.removeJobScheduler(trigger.schedulerId);
    trigger.schedulerId = null;
    await manager.update(ProjectWorkflowTrigger, { id: trigger.id }, { schedulerId: null });
  }

  private async clearPending(triggerId: string): Promise<void> {
    await this.redis.client.del(pendingKey(triggerId), queuedKey(triggerId));
  }

  private async markFired(triggerId: string): Promise<void> {
    await this.triggerRepo.update({ id: triggerId }, { lastFiredAt: new Date() });
  }

  /** A project's workflow with its file; only a project-owned file is edited. */
  private async bindingWithWorkflow(
    projectId: string,
    bindingId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ProjectWorkflow> {
    const binding = await manager.getRepository(ProjectWorkflow).findOne({
      where: { id: bindingId, projectId },
      relations: { workflow: true },
    });
    if (!binding?.workflow) {
      throw new NotFoundException(`Project workflow "${bindingId}" not found`);
    }
    if (!isProjectOwnedWorkflow(binding.workflow.filePath, projectId)) {
      throw new BadRequestException(
        'This workflow is not owned by the project: copy it into the project to give it triggers',
      );
    }
    return binding;
  }

  /** The triggers a workflow's file defines (400 for an invalid `on:`). */
  private definedTriggers(binding: ProjectWorkflow): DefinedTrigger[] {
    try {
      return triggersOfOn(binding.workflow?.content?.on);
    } catch (error) {
      if (error instanceof WorkflowOnError) {
        throw new BadRequestException(`Invalid workflow triggers: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Rewrites the `on:` block of a workflow's file from its triggers, as
   * changed by `mutate`. Only `on:` changes; the jobs stay as they are.
   */
  private async writeOn(
    binding: ProjectWorkflow,
    manager: EntityManager,
    mutate: (defined: DefinedTrigger[]) => DefinedTrigger[],
  ): Promise<void> {
    const on = onOfTriggers(mutate(this.definedTriggers(binding)));
    const content: WorkflowContent = { ...binding.workflow.content };
    delete content.on;
    if (on) content.on = on;
    await manager.getRepository(Workflow).save({ id: binding.workflow.id, content });
    binding.workflow.content = content;
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
