import { JobRunType, ProjectTriggerType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

const WORKSPACE_ID = 'ws-1';

function setup() {
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'p-1', ...value })),
    delete: jest.fn(),
  };
  const dataSource = {
    // Asset count of the project ("run now" needs something to scan).
    query: jest.fn().mockResolvedValue([{ count: 3 }]),
    manager: { findOneBy: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }) },
  };
  const assets = { add: jest.fn().mockResolvedValue([]), remove: jest.fn() };
  const scope = {
    normalizeRules: jest.fn().mockResolvedValue([]),
    replaceRules: jest.fn().mockResolvedValue({ added: [], removed: 0 }),
  };
  const workflows = {
    create: jest.fn().mockResolvedValue({ id: 'b-1' }),
    findBinding: jest.fn().mockResolvedValue({ id: 'b-1' }),
    startBindingRun: jest.fn().mockResolvedValue({ jobHistoryId: 'r-1', assets: 3 }),
    removeOwnedWorkflows: jest.fn(),
    remove: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
  };
  const triggers = {
    create: jest.fn(),
    unregisterProject: jest.fn(),
    registerProject: jest.fn(),
    onAssetsAdded: jest.fn(),
  };
  const service = new ProjectsService(
    projectRepo as never,
    dataSource as never,
    assets as never,
    scope as never,
    workflows as never,
    triggers as never,
  );
  return { service, projectRepo, dataSource, assets, scope, workflows, triggers };
}

describe('ProjectsService', () => {
  describe('create', () => {
    it('builds scope, pipeline and triggers, then runs it', async () => {
      const ctx = setup();

      await ctx.service.create(
        {
          name: 'Acme',
          hostIds: ['a-1'],
          scopeRules: [
            { mode: 'include', type: 'hostname', value: '*.acme.io' } as never,
          ],
          tools: [{ toolId: 't-1' }],
          schedule: '0 2 * * 1',
          onAssetsAdded: { windowMinutes: 5 },
          runNow: true,
        },
        WORKSPACE_ID,
      );

      expect(ctx.assets.add).toHaveBeenCalledWith('p-1', WORKSPACE_ID, ['a-1']);
      expect(ctx.scope.replaceRules).toHaveBeenCalled();
      expect(ctx.workflows.create).toHaveBeenCalledWith('p-1', WORKSPACE_ID, {
        name: undefined,
        tools: [{ toolId: 't-1' }],
      });
      expect(ctx.triggers.create).toHaveBeenCalledWith('p-1', WORKSPACE_ID, {
        projectWorkflowId: 'b-1',
        type: ProjectTriggerType.CRON,
        cron: '0 2 * * 1',
      });
      expect(ctx.triggers.create).toHaveBeenCalledWith('p-1', WORKSPACE_ID, {
        projectWorkflowId: 'b-1',
        type: ProjectTriggerType.ASSETS_ADDED,
        config: { windowMinutes: 5 },
      });
      expect(ctx.workflows.startBindingRun).toHaveBeenCalledWith(
        { id: 'b-1' },
        { jobRunType: JobRunType.MANUAL },
      );
      // Assets picked at creation are scanned by "run now", not by the
      // "assets added" trigger.
      expect(ctx.triggers.onAssetsAdded).not.toHaveBeenCalled();
    });

    it('skips "run now" when the scope is still empty instead of failing', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([{ count: 0 }]);

      await ctx.service.create(
        { name: 'Acme', tools: [{ toolId: 't-1' }], runNow: true },
        WORKSPACE_ID,
      );

      expect(ctx.workflows.startBindingRun).not.toHaveBeenCalled();
      expect(ctx.projectRepo.delete).not.toHaveBeenCalled();
    });

    it('refuses a duplicate name before writing anything', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({ id: 'other' });
      await expect(
        ctx.service.create({ name: 'Acme' }, WORKSPACE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.projectRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a schedule without a pipeline', async () => {
      const ctx = setup();
      await expect(
        ctx.service.create({ name: 'Acme', schedule: '0 2 * * 1' }, WORKSPACE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.projectRepo.save).not.toHaveBeenCalled();
    });

    it('removes everything it created when a later step fails', async () => {
      const ctx = setup();
      const failure = new BadRequestException('Tool "nuclei" is not installed');
      ctx.workflows.startBindingRun.mockRejectedValue(failure);

      await expect(
        ctx.service.create(
          { name: 'Acme', tools: [{ toolId: 't-1' }], runNow: true },
          WORKSPACE_ID,
        ),
      ).rejects.toBe(failure);

      expect(ctx.triggers.unregisterProject).toHaveBeenCalledWith('p-1');
      expect(ctx.workflows.removeOwnedWorkflows).toHaveBeenCalledWith('p-1');
      expect(ctx.projectRepo.delete).toHaveBeenCalledWith('p-1');
    });
  });

  describe('archive / unarchive', () => {
    it('archiving unregisters every schedule and stamps the project', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({ id: 'p-1', archivedAt: null });

      const archived = await ctx.service.archive('p-1', WORKSPACE_ID);

      expect(ctx.triggers.unregisterProject).toHaveBeenCalledWith('p-1');
      expect(archived.archivedAt).toBeInstanceOf(Date);
    });

    it('reopening registers the schedules again', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({
        id: 'p-1',
        archivedAt: new Date(),
      });

      const reopened = await ctx.service.unarchive('p-1', WORKSPACE_ID);

      expect(reopened.archivedAt).toBeNull();
      expect(ctx.triggers.registerProject).toHaveBeenCalledWith('p-1');
    });

    it('refuses edits while archived', async () => {
      const ctx = setup();
      ctx.projectRepo.findOne.mockResolvedValue({
        id: 'p-1',
        archivedAt: new Date(),
      });
      await expect(
        ctx.service.update('p-1', { name: 'x' }, WORKSPACE_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('assets and scope', () => {
    it('hands hand-picked new assets to the "assets added" triggers', async () => {
      const ctx = setup();
      ctx.assets.add.mockResolvedValue(['a-2']);

      await ctx.service.addAssets('p-1', WORKSPACE_ID, ['a-1', 'a-2']);

      expect(ctx.triggers.onAssetsAdded).toHaveBeenCalledWith('p-1', ['a-2']);
    });

    it('hands assets a rule edit added to the triggers', async () => {
      const ctx = setup();
      ctx.scope.replaceRules.mockResolvedValue({ added: ['a-7'], removed: 2 });

      const result = await ctx.service.replaceScope('p-1', WORKSPACE_ID, []);

      expect(ctx.triggers.onAssetsAdded).toHaveBeenCalledWith('p-1', ['a-7']);
      expect(result).toEqual({ added: 1, removed: 2 });
    });
  });

  it('delete unregisters schedules before removing workflows and the project', async () => {
    const ctx = setup();
    ctx.projectRepo.findOne.mockResolvedValue({ id: 'p-1' });
    const order: string[] = [];
    ctx.triggers.unregisterProject.mockImplementation(() => order.push('unregister'));
    ctx.workflows.removeOwnedWorkflows.mockImplementation(() => order.push('workflows'));
    ctx.projectRepo.delete.mockImplementation(() => order.push('project'));

    await ctx.service.delete('p-1', WORKSPACE_ID);

    expect(order).toEqual(['unregister', 'workflows', 'project']);
  });
});
