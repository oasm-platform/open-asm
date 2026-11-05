import {
  BullMQName,
  JobRunType,
  ProjectTriggerEvent,
  ProjectTriggerType,
  RunOutcome,
} from '@/common/enums/enum';
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
import type {
  ProjectTriggerEvents,
  ProjectTriggerFact,
} from '../event-bridge/sinks/projects/projects.sink';
import { Workflow, type WorkflowContent } from '../workflows/entities/workflow.entity';
import type { WorkflowRunScope } from '../workflows/workflow-graph';
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
  cronKey,
  type DefinedTrigger,
  DEFAULT_MAX_ASSETS,
  enabledByKey,
  eventKey,
  keyOfRow,
  MAX_CHAIN_DEPTH,
  normalizeEventConfig,
  onOfTriggers,
  planTriggerSync,
  triggersOfInput,
  triggersOfOn,
  WorkflowOnError,
  type WorkflowOnInput,
} from './workflow-on';

/** Payload of a cron scheduler job: the trigger, or a pre-trigger binding. */
export interface ProjectScheduleJobData {
  triggerId?: string;
  /** Binding id carried by schedulers registered before triggers existed. */
  id?: string;
}

/** Payload of a batch job: the event trigger whose window closed. */
export interface EventTriggerJobData {
  triggerId: string;
}

/** What one event brings to one trigger listening to it. */
interface TriggerMatch {
  trigger: ProjectWorkflowTrigger;
  assetIds: string[];
}

/** The run an event came from, as far as chains of runs are concerned. */
interface EventCause {
  runId: string;
  chainDepth: number;
  projectWorkflowId: string | null;
}

const pendingKey = (triggerId: string) =>
  `project-trigger:${triggerId}:pending`;
const queuedKey = (triggerId: string) => `project-trigger:${triggerId}:queued`;
/** Runs that caused the gathered events, scored by the depth of the next run. */
const causesKey = (triggerId: string) => `project-trigger:${triggerId}:causes`;
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
 * Which of the triggers listening to an event it starts, and on what. Pure:
 * the caller loads the triggers, the asset ids the event concerns and the
 * workflow names of the bindings.
 *
 * - `project.assets.added`: the assets that joined.
 * - `project.run.completed`: the finished run's scope, for triggers of the
 *   project's other workflows whose `workflows` and `status` accept it.
 * - `vulnerability.detected`: the asset, for triggers whose `severity` lists
 *   one of the severities found.
 */
export function matchTriggers(
  fact: ProjectTriggerFact,
  triggers: readonly ProjectWorkflowTrigger[],
  assetIds: readonly string[],
): TriggerMatch[] {
  if (assetIds.length === 0) return [];
  return triggers
    .filter((trigger) => {
      if (!trigger.event || trigger.event !== fact.event) return false;
      const config = normalizeEventConfig(trigger.event, trigger.config);
      switch (fact.event) {
        case ProjectTriggerEvent.RUN_COMPLETED: {
          if (trigger.projectWorkflowId === fact.projectWorkflowId) return false;
          const followed = (config.workflows ?? []).map((name) =>
            name.trim().toLowerCase(),
          );
          return (
            (config.status ?? []).includes(fact.outcome) &&
            (followed.length === 0 ||
              followed.includes(fact.workflowName.trim().toLowerCase()))
          );
        }
        case ProjectTriggerEvent.VULNERABILITY_DETECTED:
          return fact.severities.some((s) => (config.severity ?? []).includes(s));
        default:
          return true;
      }
    })
    .map((trigger) => ({ trigger, assetIds: [...assetIds] }));
}

/**
 * When project workflows run on their own.
 *
 * A workflow's triggers are defined in its file (`on:`, see workflow-on.ts);
 * `project_workflow_triggers` keeps one row per entry with its state.
 * Cron triggers are BullMQ job schedulers on the project schedule queue (its
 * value predates the rename; see {@link BullMQName.PROJECT_WORKFLOW_SCHEDULE}).
 * Event triggers gather the assets their events bring in a Redis set and
 * start one run when the window closes: discovery that finds 500 subdomains
 * must not start 500 runs. The projects lane of the event bridge hands the
 * events over (`onTriggerEvent`).
 *
 * Runs that trigger runs form a chain. Each run records the run that caused
 * it and its depth; an event past {@link MAX_CHAIN_DEPTH}, or one a run of the
 * listening workflow caused, starts nothing, so workflows cannot keep
 * triggering each other.
 */
@Injectable()
export class ProjectTriggersService
  implements OnApplicationBootstrap, ProjectTriggerEvents
{
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
    private readonly eventsQueue: Queue<EventTriggerJobData>,
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
   * A cron needs a cron expression and an event trigger its event; a
   * workflow has at most one trigger per event (two would start every run
   * twice).
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
      if (!dto.event) {
        throw new BadRequestException('An event trigger needs an event');
      }
      added = {
        key: eventKey(dto.event),
        type: ProjectTriggerType.EVENT,
        event: dto.event,
        config: normalizeEventConfig(dto.event, dto.config),
      };
    }
    await this.writeOn(binding, manager, (defined) => {
      if (defined.some((t) => t.key === added.key)) {
        throw new BadRequestException(
          added.type === ProjectTriggerType.CRON
            ? 'This workflow already runs on this schedule'
            : `This workflow already runs on ${added.event}`,
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
      const event = trigger.event;
      if (trigger.type !== ProjectTriggerType.EVENT || !event) {
        throw new BadRequestException('Only an event trigger has settings');
      }
      const config = normalizeEventConfig(event, { ...trigger.config, ...dto.config });
      await this.writeOn(binding, this.dataSource.manager, (defined) =>
        defined.map((t) => (t.key === eventKey(event) ? { ...t, config } : t)),
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

  /** The trigger rows of one workflow, oldest first. */
  ofWorkflow(bindingId: string): Promise<ProjectWorkflowTrigger[]> {
    return this.triggerRepo.find({
      where: { projectWorkflowId: bindingId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Replaces the `on:` block of a workflow with what the workflow editor
   * sends: its schedules and events, each possibly turned off. Entries that
   * stay keep their row (state, history, scheduler); one sent without
   * `enabled` keeps its state, a new one is on. The caller checks the
   * project is writable.
   *
   * @returns the workflow's trigger rows after the change
   */
  async replaceOn(
    projectId: string,
    bindingId: string,
    input: WorkflowOnInput,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ProjectWorkflowTrigger[]> {
    const defined = definedTriggersOfInput(input);
    const binding = await this.bindingWithWorkflow(projectId, bindingId, manager);
    await this.writeOn(binding, manager, () => defined);
    const rows = await this.syncWorkflow(bindingId, manager);

    const project = await manager
      .getRepository(Project)
      .findOne({ where: { id: projectId } });
    const wanted = enabledByKey(input);
    for (const row of rows) {
      const enabled = wanted.get(keyOfRow(row));
      if (enabled === undefined || enabled === row.enabled) continue;
      row.enabled = enabled;
      await this.unregister(row, manager);
      await manager.getRepository(ProjectWorkflowTrigger).save(row);
      if (enabled && !project?.archivedAt) await this.register(row, manager);
    }
    return rows;
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
          event: defined.event ?? null,
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
   * An event a project trigger can run on (from the projects lane). Each
   * enabled trigger listening to it gathers the assets it concerns and, when
   * no batch is open yet, opens one that closes after its window. Skipped:
   * a trigger of the workflow whose own run caused the event (it would
   * trigger itself), and any trigger once the chain is past its depth.
   */
  async onTriggerEvent(fact: ProjectTriggerFact): Promise<void> {
    const [triggers, cause] = await Promise.all([
      this.listeningTriggers(fact),
      this.causeOf(fact),
    ]);
    if (triggers.length === 0) return;
    const matches = matchTriggers(fact, triggers, await this.assetsOf(fact));
    if (matches.length === 0) return;

    const chainDepth = cause ? cause.chainDepth + 1 : 0;
    if (chainDepth > MAX_CHAIN_DEPTH) {
      this.logger.log(
        `${fact.event} from run ${cause?.runId} starts nothing: the chain is past ${MAX_CHAIN_DEPTH} runs`,
      );
      return;
    }
    for (const { trigger, assetIds } of matches) {
      // Finding assets for itself is how discovery keeps the project current
      // (the depth still bounds it); a run reacting to its own completion or
      // findings would only loop.
      if (
        cause?.projectWorkflowId === trigger.projectWorkflowId &&
        fact.event !== ProjectTriggerEvent.ASSETS_ADDED
      ) {
        continue;
      }
      await this.gather(trigger, assetIds, cause ? { runId: cause.runId, chainDepth } : null);
    }
  }

  /**
   * A batch window closed: drains the gathered assets and starts one run per
   * `maxAssets` of them that are still in the project (and of the configured
   * target types). The runs record the deepest run that caused the batch.
   */
  async fireEvent(triggerId: string): Promise<void> {
    await this.redis.client.del(queuedKey(triggerId));
    const result = await this.redis.client
      .multi()
      .smembers(pendingKey(triggerId))
      .del(pendingKey(triggerId))
      .zrevrange(causesKey(triggerId), 0, 0, 'WITHSCORES')
      .del(causesKey(triggerId))
      .exec();
    const gathered = (result?.[0]?.[1] as string[] | undefined) ?? [];
    const [causeRunId, causeDepth] =
      (result?.[2]?.[1] as string[] | undefined) ?? [];

    const trigger = await this.triggerRepo.findOne({
      where: { id: triggerId },
      relations: { projectWorkflow: true },
    });
    if (!trigger?.enabled || trigger.type !== ProjectTriggerType.EVENT || !trigger.event) {
      return;
    }
    const binding = await this.workflows.findBinding(
      trigger.projectWorkflow.projectId,
      trigger.projectWorkflowId,
    );
    if (binding.project.archivedAt || gathered.length === 0) return;

    const config = normalizeEventConfig(trigger.event, trigger.config);
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
          ...(causeRunId
            ? { causedByRunId: causeRunId, chainDepth: Number(causeDepth) }
            : {}),
        });
      } catch (error) {
        // One unrunnable batch (a root tool uninstalled since) must not drop
        // the others: log it, the run list shows nothing started.
        this.logger.warn(
          `${trigger.event} run of trigger ${trigger.id} not started: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Drops a scheduler nothing resolves to any more. */
  async removeScheduler(schedulerId: string): Promise<void> {
    await this.scheduleQueue.removeJobScheduler(schedulerId);
  }

  /** Adds assets to a trigger's batch, opening one when none is. */
  private async gather(
    trigger: ProjectWorkflowTrigger,
    assetIds: string[],
    cause: { runId: string; chainDepth: number } | null,
  ): Promise<void> {
    const config = normalizeEventConfig(trigger.event!, trigger.config);
    const delay = (config.windowMinutes ?? 0) * 60_000;
    const tx = this.redis.client
      .multi()
      .sadd(pendingKey(trigger.id), ...assetIds)
      .expire(pendingKey(trigger.id), PENDING_TTL_SECONDS);
    if (cause) {
      tx.zadd(causesKey(trigger.id), 'GT', cause.chainDepth, cause.runId).expire(
        causesKey(trigger.id),
        PENDING_TTL_SECONDS,
      );
    }
    await tx.exec();
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
    if (opened !== 'OK') return;
    await this.eventsQueue.add(
      'event-trigger',
      { triggerId: trigger.id },
      { delay, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  /** The enabled triggers of active projects that listen to the event. */
  private listeningTriggers(
    fact: ProjectTriggerFact,
  ): Promise<ProjectWorkflowTrigger[]> {
    const qb = this.triggerRepo
      .createQueryBuilder('trigger')
      .innerJoin('trigger.projectWorkflow', 'binding')
      .innerJoin('binding.project', 'project')
      .where('trigger.type = :type', { type: ProjectTriggerType.EVENT })
      .andWhere('trigger.event = :event', { event: fact.event })
      .andWhere('trigger.enabled = true')
      .andWhere('project.archivedAt IS NULL')
      .andWhere('project."workspaceId" = :workspaceId', {
        workspaceId: fact.workspaceId,
      });
    if (fact.event === ProjectTriggerEvent.VULNERABILITY_DETECTED) {
      // Every project the asset belongs to, whichever run found it.
      qb.andWhere(
        `EXISTS (SELECT 1 FROM project_assets pa
                  WHERE pa."projectId" = binding."projectId" AND pa."assetId" = :assetId)`,
        { assetId: fact.assetId },
      );
    } else {
      qb.andWhere('binding.projectId = :projectId', { projectId: fact.projectId });
    }
    return qb.getMany();
  }

  /** The assets an event concerns; a finished run's are its scope. */
  private async assetsOf(fact: ProjectTriggerFact): Promise<string[]> {
    switch (fact.event) {
      case ProjectTriggerEvent.ASSETS_ADDED:
        return fact.assetIds;
      case ProjectTriggerEvent.VULNERABILITY_DETECTED:
        return [fact.assetId];
      case ProjectTriggerEvent.RUN_COMPLETED: {
        const [row]: Array<{ scope: WorkflowRunScope | null }> =
          await this.dataSource.query(
            `SELECT scope FROM job_histories WHERE id = $1`,
            [fact.runId],
          );
        return row?.scope?.assetIds ?? [];
      }
    }
  }

  /** The run an event came from, if a run caused it. */
  private async causeOf(fact: ProjectTriggerFact): Promise<EventCause | null> {
    const rows: Array<{
      id: string;
      chainDepth: number;
      projectWorkflowId: string | null;
    }> =
      fact.event === ProjectTriggerEvent.VULNERABILITY_DETECTED
        ? await this.dataSource.query(
            `SELECT jh.id, jh."chainDepth", jh."projectWorkflowId"
               FROM jobs j JOIN job_histories jh ON jh.id = j."jobHistoryId"
              WHERE j.id = $1`,
            [fact.jobId],
          )
        : fact.runId
          ? await this.dataSource.query(
              `SELECT id, "chainDepth", "projectWorkflowId" FROM job_histories WHERE id = $1`,
              [fact.runId],
            )
          : [];
    const row = rows[0];
    return row
      ? {
          runId: row.id,
          chainDepth: Number(row.chainDepth ?? 0),
          projectWorkflowId: row.projectWorkflowId,
        }
      : null;
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
    await this.redis.client.del(
      pendingKey(triggerId),
      queuedKey(triggerId),
      causesKey(triggerId),
    );
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

/** The triggers of a workflow editor's `on` input (400 for an invalid one). */
export function definedTriggersOfInput(input: WorkflowOnInput): DefinedTrigger[] {
  try {
    return triggersOfInput(input);
  } catch (error) {
    if (error instanceof WorkflowOnError) {
      throw new BadRequestException(`Invalid workflow triggers: ${error.message}`);
    }
    throw error;
  }
}

/** How a finished run ended, from its step states. */
export function runOutcomeOf(
  steps: Record<string, { status?: string; reason?: string }> | null | undefined,
): RunOutcome {
  return Object.values(steps ?? {}).some(
    (state) =>
      state.status === 'failed' ||
      (state.status === 'skipped' && state.reason === 'blocked-by-failure'),
  )
    ? RunOutcome.FAILURE
    : RunOutcome.SUCCESS;
}
