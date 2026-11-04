import { JobRunType, ProjectTriggerType } from '@/common/enums/enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Project } from './entities/project.entity';
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

  describe('create', () => {
    beforeEach(() => jest.clearAllMocks());

    it('refuses a cron trigger without an expression', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({ id: PROJECT_ID });
      ctx.bindingRepo.findOne.mockResolvedValue({ id: BINDING_ID });

      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.CRON,
          cron: 'disabled',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a second "assets added" trigger on one workflow', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({ id: PROJECT_ID });
      ctx.bindingRepo.findOne.mockResolvedValue({ id: BINDING_ID });
      ctx.triggerRepo.count.mockResolvedValue(1);

      await expect(
        ctx.service.create(PROJECT_ID, 'ws', {
          projectWorkflowId: BINDING_ID,
          type: ProjectTriggerType.ASSETS_ADDED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('registers a cron trigger with defaults filled in', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({ id: PROJECT_ID });
      ctx.bindingRepo.findOne.mockResolvedValue({ id: BINDING_ID });

      const trigger = await ctx.service.create(PROJECT_ID, 'ws', {
        projectWorkflowId: BINDING_ID,
        type: ProjectTriggerType.CRON,
        cron: ' 0 2 * * 1 ',
      });

      expect(trigger.cron).toBe('0 2 * * 1');
      expect(ctx.scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'project-trigger:t-new',
        { pattern: '0 2 * * 1' },
        { name: 't-new', data: { triggerId: 't-new' } },
      );
    });

    it('does not register a schedule while the project is archived', async () => {
      const ctx = setup();
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
  });
});
