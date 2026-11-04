import { JobRunType, ProjectTriggerType } from '@/common/enums/enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Project } from './entities/project.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import type { ProjectWorkflowTrigger } from './entities/project-workflow-trigger.entity';
import { chunk, ProjectTriggersService } from './project-triggers.service';

const PROJECT_ID = 'p-1';
const BINDING_ID = 'b-1';

const qb = (result: unknown) => {
  const builder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result),
    getOne: jest.fn().mockResolvedValue(result),
  };
  return builder;
};

function setup() {
  const multi = {
    sadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    smembers: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const redis = {
    client: {
      multi: jest.fn(() => multi),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    },
  };
  const projectRepo = { findOne: jest.fn() };
  const bindingRepo = { findOne: jest.fn() };
  const triggerRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 't-new', ...value })),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Project
        ? projectRepo
        : entity === ProjectWorkflow
          ? bindingRepo
          : triggerRepo,
    ),
    update: jest.fn(),
  };
  const dataSource = { query: jest.fn(), manager };
  const scheduleQueue = {
    upsertJobScheduler: jest.fn(),
    removeJobScheduler: jest.fn(),
  };
  const eventsQueue = { add: jest.fn() };
  const workflows = {
    findBinding: jest.fn(),
    startBindingRun: jest.fn().mockResolvedValue({ jobHistoryId: 'run', assets: 1 }),
  };

  const service = new ProjectTriggersService(
    projectRepo as never,
    bindingRepo as never,
    triggerRepo as never,
    scheduleQueue as never,
    eventsQueue as never,
    redis as never,
    dataSource as never,
    workflows as never,
  );
  return {
    service,
    multi,
    redis,
    projectRepo,
    bindingRepo,
    triggerRepo,
    manager,
    dataSource,
    scheduleQueue,
    eventsQueue,
    workflows,
  };
}

const assetsAddedTrigger = (
  overrides: Partial<ProjectWorkflowTrigger> = {},
): ProjectWorkflowTrigger =>
  ({
    id: 't-1',
    projectWorkflowId: BINDING_ID,
    projectWorkflow: { projectId: PROJECT_ID } as ProjectWorkflow,
    type: ProjectTriggerType.ASSETS_ADDED,
    cron: null,
    config: { windowMinutes: 10, maxAssets: 2 },
    enabled: true,
    lastFiredAt: null,
    schedulerId: null,
    ...overrides,
  }) as ProjectWorkflowTrigger;

describe('chunk', () => {
  it('splits into runs of at most the size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('ProjectTriggersService', () => {
  describe('onAssetsAdded', () => {
    it('gathers the assets and opens one batch per trigger for its window', async () => {
      const ctx = setup();
      ctx.triggerRepo.createQueryBuilder.mockReturnValue(
        qb([assetsAddedTrigger()]),
      );

      await ctx.service.onAssetsAdded(PROJECT_ID, ['a-1', 'a-2']);

      expect(ctx.multi.sadd).toHaveBeenCalledWith(
        'project-trigger:t-1:pending',
        'a-1',
        'a-2',
      );
      expect(ctx.redis.client.set).toHaveBeenCalledWith(
        'project-trigger:t-1:queued',
        '1',
        'EX',
        600 + 3600,
        'NX',
      );
      expect(ctx.eventsQueue.add).toHaveBeenCalledWith(
        'assets-added',
        { triggerId: 't-1' },
        expect.objectContaining({ delay: 600_000 }),
      );
    });

    it('joins an open batch instead of opening another', async () => {
      const ctx = setup();
      ctx.triggerRepo.createQueryBuilder.mockReturnValue(
        qb([assetsAddedTrigger()]),
      );
      ctx.redis.client.set.mockResolvedValue(null);

      await ctx.service.onAssetsAdded(PROJECT_ID, ['a-3']);

      expect(ctx.multi.sadd).toHaveBeenCalled();
      expect(ctx.eventsQueue.add).not.toHaveBeenCalled();
    });

    it('does nothing for no assets', async () => {
      const ctx = setup();
      await ctx.service.onAssetsAdded(PROJECT_ID, []);
      expect(ctx.triggerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('fireAssetsAdded', () => {
    it('drains the batch and starts one event run per maxAssets of project assets', async () => {
      const ctx = setup();
      ctx.multi.exec.mockResolvedValue([
        [null, ['a-1', 'a-2', 'a-3', 'gone']],
        [null, 1],
      ]);
      ctx.triggerRepo.findOne.mockResolvedValue(assetsAddedTrigger());
      const binding = { id: BINDING_ID, projectId: PROJECT_ID, project: {} };
      ctx.workflows.findBinding.mockResolvedValue(binding);
      ctx.dataSource.query.mockResolvedValue([
        { assetId: 'a-1' },
        { assetId: 'a-2' },
        { assetId: 'a-3' },
      ]);

      await ctx.service.fireAssetsAdded('t-1');

      // The flag goes first, so assets added while draining open a new batch.
      expect(ctx.redis.client.del).toHaveBeenCalledWith(
        'project-trigger:t-1:queued',
      );
      expect(ctx.dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM project_assets pa'),
        [PROJECT_ID, ['a-1', 'a-2', 'a-3', 'gone'], []],
      );
      expect(ctx.workflows.startBindingRun).toHaveBeenCalledTimes(2);
      expect(ctx.workflows.startBindingRun).toHaveBeenNthCalledWith(1, binding, {
        jobRunType: JobRunType.EVENT,
        triggerId: 't-1',
        assetIds: ['a-1', 'a-2'],
      });
      expect(ctx.workflows.startBindingRun).toHaveBeenNthCalledWith(2, binding, {
        jobRunType: JobRunType.EVENT,
        triggerId: 't-1',
        assetIds: ['a-3'],
      });
    });

    it('starts nothing for a disabled trigger', async () => {
      const ctx = setup();
      ctx.multi.exec.mockResolvedValue([[null, ['a-1']], [null, 1]]);
      ctx.triggerRepo.findOne.mockResolvedValue(
        assetsAddedTrigger({ enabled: false }),
      );

      await ctx.service.fireAssetsAdded('t-1');

      expect(ctx.workflows.startBindingRun).not.toHaveBeenCalled();
    });

    it('starts nothing for an archived project', async () => {
      const ctx = setup();
      ctx.multi.exec.mockResolvedValue([[null, ['a-1']], [null, 1]]);
      ctx.triggerRepo.findOne.mockResolvedValue(assetsAddedTrigger());
      ctx.workflows.findBinding.mockResolvedValue({
        projectId: PROJECT_ID,
        project: { archivedAt: new Date() },
      });

      await ctx.service.fireAssetsAdded('t-1');

      expect(ctx.dataSource.query).not.toHaveBeenCalled();
      expect(ctx.workflows.startBindingRun).not.toHaveBeenCalled();
    });
  });

  describe('fireCron', () => {
    const cronTrigger = (overrides: Partial<ProjectWorkflowTrigger> = {}) =>
      assetsAddedTrigger({
        type: ProjectTriggerType.CRON,
        cron: '0 2 * * 1',
        config: {},
        schedulerId: 'project-trigger:t-1',
        ...overrides,
      });

    it('runs the whole scope as a scheduled run', async () => {
      const ctx = setup();
      ctx.triggerRepo.findOne.mockResolvedValue(cronTrigger());
      const binding = { id: BINDING_ID, projectId: PROJECT_ID, project: {} };
      ctx.workflows.findBinding.mockResolvedValue(binding);

      await ctx.service.fireCron({ triggerId: 't-1' }, 'project-trigger:t-1');

      expect(ctx.workflows.startBindingRun).toHaveBeenCalledWith(binding, {
        jobRunType: JobRunType.SCHEDULED,
        triggerId: 't-1',
      });
      expect(ctx.scheduleQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('resolves a scheduler from before triggers and re-keys it', async () => {
      const ctx = setup();
      ctx.triggerRepo.find.mockResolvedValue([
        cronTrigger({ schedulerId: 'repeat:legacy' }),
      ]);
      ctx.workflows.findBinding.mockResolvedValue({
        id: BINDING_ID,
        projectId: PROJECT_ID,
        project: {},
      });

      await ctx.service.fireCron({ id: BINDING_ID }, 'repeat:legacy');

      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith(
        'repeat:legacy',
      );
      expect(ctx.scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'project-trigger:t-1',
        { pattern: '0 2 * * 1' },
        { name: 't-1', data: { triggerId: 't-1' } },
      );
      expect(ctx.workflows.startBindingRun).toHaveBeenCalledWith(
        expect.anything(),
        { jobRunType: JobRunType.SCHEDULED, triggerId: 't-1' },
      );
    });

    it('only unregisters when the project is archived', async () => {
      const ctx = setup();
      ctx.triggerRepo.findOne.mockResolvedValue(cronTrigger());
      ctx.workflows.findBinding.mockResolvedValue({
        projectId: PROJECT_ID,
        project: { archivedAt: new Date() },
      });

      await ctx.service.fireCron({ triggerId: 't-1' }, 'project-trigger:t-1');

      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith(
        'project-trigger:t-1',
      );
      expect(ctx.workflows.startBindingRun).not.toHaveBeenCalled();
    });

    it('throws NotFound for an orphaned scheduler', async () => {
      const ctx = setup();
      ctx.triggerRepo.findOne.mockResolvedValue(null);
      await expect(
        ctx.service.fireCron({ triggerId: 'gone' }, 'project-trigger:gone'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('triggers live in the workflow file', () => {
    /**
     * A project with one workflow: its file (`content`) and its trigger rows,
     * kept in memory so each test reads what the service wrote.
     */
    function fileSetup({
      on,
      rows = [],
      archived = false,
    }: {
      on?: object;
      rows?: Array<Partial<ProjectWorkflowTrigger>>;
      archived?: boolean;
    } = {}) {
      const ctx = setup();
      const project = { id: PROJECT_ID, archivedAt: archived ? new Date() : null };
      const workflow = {
        id: 'w-1',
        filePath: `project-${PROJECT_ID}-1.yaml`,
        content: { name: 'Scan', jobs: { nuclei: { run: 'nuclei' } }, ...(on ? { on } : {}) } as Record<string, unknown>,
      };
      const binding = { id: BINDING_ID, projectId: PROJECT_ID, workflow, project };
      let table = rows.map((row, i) => ({
        id: `t-${i + 1}`,
        projectWorkflowId: BINDING_ID,
        cron: null,
        config: {},
        enabled: true,
        schedulerId: null,
        lastFiredAt: null,
        ...row,
      })) as ProjectWorkflowTrigger[];
      let nextId = table.length + 1;

      ctx.projectRepo.findOne.mockResolvedValue(project);
      ctx.bindingRepo.findOne.mockImplementation(() => Promise.resolve(binding));
      ctx.triggerRepo.find.mockImplementation(() => Promise.resolve([...table]));
      ctx.triggerRepo.createQueryBuilder.mockImplementation(() => {
        const builder = qb(undefined);
        let id: string | undefined;
        builder.where.mockImplementation((_sql: string, params?: { triggerId?: string }) => {
          id = params?.triggerId;
          return builder;
        });
        builder.getOne.mockImplementation(() => Promise.resolve(table.find((t) => t.id === id) ?? null));
        return builder;
      });
      ctx.triggerRepo.save.mockImplementation((row: ProjectWorkflowTrigger) => {
        const saved = { ...row, id: row.id ?? `t-${nextId++}` };
        table = [...table.filter((t) => t.id !== saved.id), saved];
        return Promise.resolve(saved);
      });
      ctx.triggerRepo.delete.mockImplementation((id: string) => {
        table = table.filter((t) => t.id !== id);
        return Promise.resolve();
      });
      const workflowRepo = {
        save: jest.fn((value: { content: Record<string, unknown> }) => {
          workflow.content = value.content;
          return Promise.resolve(value);
        }),
      };
      const repoOf = ctx.manager.getRepository.getMockImplementation()!;
      ctx.manager.getRepository.mockImplementation((entity: unknown) =>
        entity === Workflow ? workflowRepo : repoOf(entity),
      );
      return { ...ctx, workflow, rows: () => table };
    }

    it('writes a new schedule into the file, then gives it a row and a scheduler', async () => {
      const ctx = fileSetup();

      const trigger = await ctx.service.create(PROJECT_ID, 'ws', {
        projectWorkflowId: BINDING_ID,
        type: ProjectTriggerType.CRON,
        cron: ' 0 2 * * 1 ',
      });

      expect(ctx.workflow.content.on).toEqual({ schedule: [{ cron: '0 2 * * 1' }] });
      expect(trigger).toMatchObject({ cron: '0 2 * * 1', enabled: true });
      expect(ctx.scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        `project-trigger:${trigger.id}`,
        { pattern: '0 2 * * 1' },
        { name: trigger.id, data: { triggerId: trigger.id } },
      );
    });

    it('lets one workflow run on several schedules, each with its own scheduler', async () => {
      const ctx = fileSetup({ on: { schedule: [{ cron: '0 2 * * 1' }] }, rows: [{ type: ProjectTriggerType.CRON, cron: '0 2 * * 1' }] });

      await ctx.service.create(PROJECT_ID, 'ws', {
        projectWorkflowId: BINDING_ID,
        type: ProjectTriggerType.CRON,
        cron: '30 14 * * *',
      });

      expect(ctx.workflow.content.on).toEqual({
        schedule: [{ cron: '0 2 * * 1' }, { cron: '30 14 * * *' }],
      });
      expect(ctx.rows().map((t) => t.cron)).toEqual(['0 2 * * 1', '30 14 * * *']);
    });

    it('refuses a schedule the workflow already has, and a second "assets added"', async () => {
      const ctx = fileSetup({
        on: { schedule: [{ cron: '0 2 * * 1' }], assetsAdded: { windowMinutes: 5 } },
      });

      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.CRON,
          cron: '0 2 * * 1',
        }),
      ).rejects.toThrow('This workflow already runs on this schedule');
      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.ASSETS_ADDED,
        }),
      ).rejects.toThrow('This workflow already runs when assets are added');
    });

    it('refuses a cron trigger without an expression', async () => {
      const ctx = fileSetup();
      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.CRON,
          cron: 'disabled',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not register a schedule while the project is archived', async () => {
      const ctx = fileSetup({ archived: true });
      ctx.projectRepo.findOne.mockResolvedValue({ id: PROJECT_ID, archivedAt: new Date() });

      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.CRON,
          cron: '0 2 * * 1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.scheduleQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('changes a schedule in the file and keeps the row (id, history) with it', async () => {
      const firedAt = new Date('2026-11-01T02:00:00Z');
      const ctx = fileSetup({
        on: { schedule: [{ cron: '0 2 * * 1' }] },
        rows: [{ type: ProjectTriggerType.CRON, cron: '0 2 * * 1', lastFiredAt: firedAt, schedulerId: 'project-trigger:t-1' }],
      });

      const updated = await ctx.service.update(PROJECT_ID, 'ws', 't-1', { cron: '0 3 * * 1' });

      expect(ctx.workflow.content.on).toEqual({ schedule: [{ cron: '0 3 * * 1' }] });
      expect(updated).toMatchObject({ id: 't-1', cron: '0 3 * * 1', lastFiredAt: firedAt });
      expect(ctx.rows()).toHaveLength(1);
      expect(ctx.scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'project-trigger:t-1',
        { pattern: '0 3 * * 1' },
        expect.anything(),
      );
    });

    it('turns a trigger off in the table only: the file keeps it', async () => {
      const ctx = fileSetup({
        on: { schedule: [{ cron: '0 2 * * 1' }] },
        rows: [{ type: ProjectTriggerType.CRON, cron: '0 2 * * 1', schedulerId: 'project-trigger:t-1' }],
      });

      const updated = await ctx.service.update(PROJECT_ID, 'ws', 't-1', { enabled: false });

      expect(updated.enabled).toBe(false);
      expect(ctx.workflow.content.on).toEqual({ schedule: [{ cron: '0 2 * * 1' }] });
      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('project-trigger:t-1');
      expect(ctx.scheduleQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('removes a trigger from the file, its row and its scheduler', async () => {
      const ctx = fileSetup({
        on: { schedule: [{ cron: '0 2 * * 1' }], assetsAdded: { windowMinutes: 10, maxAssets: 200, targetTypes: [] } },
        rows: [
          { type: ProjectTriggerType.CRON, cron: '0 2 * * 1', schedulerId: 'project-trigger:t-1' },
          { type: ProjectTriggerType.ASSETS_ADDED, config: { windowMinutes: 10, maxAssets: 200, targetTypes: [] } },
        ],
      });

      await ctx.service.remove(PROJECT_ID, 'ws', 't-1');

      expect(ctx.workflow.content.on).toEqual({
        assetsAdded: { windowMinutes: 10, maxAssets: 200, targetTypes: [] },
      });
      expect(ctx.rows().map((t) => t.type)).toEqual([ProjectTriggerType.ASSETS_ADDED]);
      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('project-trigger:t-1');
    });

    it('syncs rows to a file edited elsewhere', async () => {
      const ctx = fileSetup({
        on: { schedule: ['0 4 * * *'] },
        rows: [{ type: ProjectTriggerType.CRON, cron: '0 2 * * 1', schedulerId: 'project-trigger:t-1' }],
      });

      const rows = await ctx.service.syncWorkflow(BINDING_ID);

      expect(rows.map((t) => t.cron)).toEqual(['0 4 * * *']);
      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('project-trigger:t-1');
      expect(ctx.scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        `project-trigger:${rows[0].id}`,
        { pattern: '0 4 * * *' },
        expect.anything(),
      );
    });

    it('refuses a workflow it does not own', async () => {
      const ctx = fileSetup();
      ctx.workflow.filePath = 'domain_discovery';

      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.CRON,
          cron: '0 2 * * 1',
        }),
      ).rejects.toThrow('This workflow is not owned by the project');
    });
  });

  describe('reconcileSchedulers', () => {
    it('restores lost schedulers and removes the ones nothing uses', async () => {
      const ctx = setup();
      const live = {
        id: 't-1',
        type: ProjectTriggerType.CRON,
        cron: '0 2 * * 1',
        enabled: true,
        schedulerId: null,
        projectWorkflow: { project: { archivedAt: null } },
      };
      const archived = {
        id: 't-2',
        type: ProjectTriggerType.CRON,
        cron: '0 3 * * 1',
        enabled: true,
        schedulerId: 'project-trigger:t-2',
        projectWorkflow: { project: { archivedAt: new Date() } },
      };
      const syncWorkflow = jest.spyOn(ctx.service, 'syncWorkflow').mockResolvedValue([]);
      (ctx.bindingRepo as unknown as { find: jest.Mock }).find = jest.fn().mockResolvedValue([{ id: BINDING_ID }]);
      ctx.triggerRepo.find.mockResolvedValue([live, archived]);
      Object.assign(ctx.scheduleQueue, {
        getJobSchedulers: jest.fn().mockResolvedValue([
          { key: 'project-trigger:t-1' },
          { key: 'project-trigger:gone' },
          { key: '33ab36101adebf9b13aabbcde93f3558' },
        ]),
      });

      const result = await ctx.service.reconcileSchedulers();

      expect(syncWorkflow).toHaveBeenCalledWith(BINDING_ID);
      expect(ctx.scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'project-trigger:t-1',
        { pattern: '0 2 * * 1' },
        expect.anything(),
      );
      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('project-trigger:t-2');
      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('project-trigger:gone');
      expect(ctx.scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('33ab36101adebf9b13aabbcde93f3558');
      expect(ctx.scheduleQueue.removeJobScheduler).not.toHaveBeenCalledWith('project-trigger:t-1');
      expect(result).toEqual({ registered: 1, removed: 2 });
    });
  });
});
