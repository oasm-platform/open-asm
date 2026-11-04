import { JobRunType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Project } from './entities/project.entity';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import { ProjectWorkflowsService } from './project-workflows.service';

const PROJECT_ID = 'p-1';
const WORKSPACE_ID = 'ws-1';

function setup() {
  const projectRepo = {
    findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID, name: 'Acme' }),
  };
  const bindingRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'b-new', ...value })),
    delete: jest.fn(),
  };
  const workflowRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 'w-new', ...value })),
    delete: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Project
        ? projectRepo
        : entity === ProjectWorkflow
          ? bindingRepo
          : entity === Workflow
            ? workflowRepo
            : undefined,
    ),
    find: jest.fn(),
  };
  const dataSource = { query: jest.fn(), manager };
  const toolsService = {
    getToolByNames: jest.fn().mockResolvedValue([{ name: 'nuclei' }]),
    getProfileToolIds: jest.fn().mockResolvedValue(new Set()),
  };
  const runner = {
    startRun: jest.fn().mockResolvedValue({ jobHistory: { id: 'run-1' } }),
  };
  const workflowsService = { updateWorkflow: jest.fn() };
  const service = new ProjectWorkflowsService(
    projectRepo as never,
    bindingRepo as never,
    workflowRepo as never,
    dataSource as never,
    toolsService as never,
    runner as never,
    { getConnector: jest.fn() } as never,
    { getDEK: jest.fn().mockResolvedValue(null) } as never,
    workflowsService as never,
  );
  return {
    service,
    projectRepo,
    bindingRepo,
    workflowRepo,
    dataSource,
    runner,
    workflowsService,
  };
}

const binding = {
  id: 'b-1',
  projectId: PROJECT_ID,
  project: { id: PROJECT_ID, name: 'Acme' },
  workflow: {
    id: 'w-1',
    name: 'Vuln scan',
    filePath: `project-${PROJECT_ID}-x.yaml`,
    workspace: { id: WORKSPACE_ID },
    content: { name: 'Vuln scan', jobs: { nuclei: { run: 'nuclei' } } },
  },
} as unknown as ProjectWorkflow;

describe('ProjectWorkflowsService', () => {
  describe('startBindingRun', () => {
    it('runs on the project assets and records the project, binding and trigger', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([
        { assetId: 'a-1' },
        { assetId: 'a-2' },
      ]);

      const result = await ctx.service.startBindingRun(binding, {
        jobRunType: JobRunType.EVENT,
        triggerId: 't-1',
      });

      expect(ctx.runner.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          assetIds: ['a-1', 'a-2'],
          jobName: 'Acme',
          jobRunType: JobRunType.EVENT,
          projectId: PROJECT_ID,
          projectWorkflowId: 'b-1',
          triggerId: 't-1',
          workspaceId: WORKSPACE_ID,
        }),
      );
      expect(result).toEqual({ jobHistoryId: 'run-1', assets: 2 });
    });

    it('keeps a selection inside the project', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([{ assetId: 'a-1' }]);

      await ctx.service.startBindingRun(binding, {
        jobRunType: JobRunType.MANUAL,
        assetIds: ['a-1', 'foreign'],
      });

      expect(ctx.runner.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ assetIds: ['a-1'] }),
      );
    });

    it('refuses a project without assets', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([]);
      await expect(
        ctx.service.startBindingRun(binding, { jobRunType: JobRunType.MANUAL }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.runner.startRun).not.toHaveBeenCalled();
    });

    it('refuses a run whose root tool is not installed', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([{ assetId: 'a-1' }]);
      (
        ctx.service as unknown as {
          toolsService: { getToolByNames: jest.Mock };
        }
      ).toolsService.getToolByNames.mockResolvedValue([]);
      await expect(
        ctx.service.startBindingRun(binding, { jobRunType: JobRunType.MANUAL }),
      ).rejects.toThrow('Tool "nuclei" is not installed');
    });
  });

  describe('create', () => {
    it.each([
      [{}],
      [{ template: 'a.yaml', copyFromProjectWorkflowId: 'b-2' }],
    ])('needs exactly one source (%j)', async (dto) => {
      const ctx = setup();
      await expect(
        ctx.service.create(PROJECT_ID, WORKSPACE_ID, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('copies a template into a project-owned workflow without its triggers', async () => {
      const ctx = setup();
      ctx.workflowRepo.findOne.mockResolvedValue({
        name: 'Domain discovery',
        content: {
          name: 'domain_discovery',
          on: { target: ['domain.create'] },
          jobs: {
            scan_subdomain: { run: 'subfinder' },
            port_scan: { run: 'naabu', needs: ['scan_subdomain'] },
          },
        },
      });

      const created = await ctx.service.create(PROJECT_ID, WORKSPACE_ID, {
        template: 'domain_discovery.yaml',
      });

      const saved = ctx.workflowRepo.create.mock.calls[0][0] as {
        filePath: string;
        content: { on?: unknown; jobs: Record<string, unknown> };
        name: string;
      };
      expect(saved.filePath).toMatch(new RegExp(`^project-${PROJECT_ID}-`));
      expect(saved.name).toBe('Domain discovery');
      expect(saved.content.on).toBeUndefined();
      expect(Object.keys(saved.content.jobs)).toEqual([
        'scan_subdomain',
        'port_scan',
      ]);
      expect(created.projectId).toBe(PROJECT_ID);
    });
  });

  describe('update', () => {
    it('refuses a workflow the project does not own', async () => {
      const ctx = setup();
      ctx.bindingRepo.findOne.mockResolvedValue({
        ...binding,
        workflow: { ...binding.workflow, filePath: 'domain_discovery.yaml' },
      });
      await expect(
        ctx.service.update(PROJECT_ID, WORKSPACE_ID, 'b-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.workflowsService.updateWorkflow).not.toHaveBeenCalled();
    });

    it('drops target triggers left in an old project workflow', async () => {
      const ctx = setup();
      ctx.bindingRepo.findOne.mockResolvedValue({
        ...binding,
        workflow: {
          ...binding.workflow,
          content: {
            ...binding.workflow.content,
            on: { schedule: '0 0 */3 * *', target: [] },
          },
        },
      });

      await ctx.service.update(PROJECT_ID, WORKSPACE_ID, 'b-1', {
        name: 'Renamed',
      });

      expect(ctx.workflowsService.updateWorkflow).toHaveBeenCalledWith(
        'w-1',
        {
          name: 'Renamed',
          content: {
            name: 'Renamed',
            jobs: { nuclei: { run: 'nuclei' } },
          },
        },
        { id: WORKSPACE_ID },
      );
    });
  });

  describe('remove', () => {
    it('deletes an owned workflow and only unbinds a foreign one', async () => {
      const ctx = setup();
      ctx.bindingRepo.findOne.mockResolvedValueOnce(binding);
      await ctx.service.remove(PROJECT_ID, 'b-1');
      expect(ctx.workflowRepo.delete).toHaveBeenCalledWith('w-1');

      ctx.bindingRepo.findOne.mockResolvedValueOnce({
        ...binding,
        workflow: { ...binding.workflow, filePath: 'domain_discovery.yaml' },
      });
      await ctx.service.remove(PROJECT_ID, 'b-1');
      expect(ctx.bindingRepo.delete).toHaveBeenCalledWith('b-1');
      expect(ctx.workflowRepo.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLastRunForBindings', () => {
    it('skips a run with no job rows left', async () => {
      const ctx = setup();
      ctx.dataSource.query.mockResolvedValue([
        { projectWorkflowId: 'b-1', id: 'r-1', totalJobs: 0, status: 'pending' },
        { projectWorkflowId: 'b-2', id: 'r-2', totalJobs: 3, status: 'completed' },
      ]);
      const runs = await ctx.service.getLastRunForBindings(['b-1', 'b-2']);
      expect(runs.has('b-1')).toBe(false);
      expect(runs.get('b-2')).toEqual(
        expect.objectContaining({ id: 'r-2', status: 'completed' }),
      );
    });
  });
});
