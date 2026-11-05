import {
  ProjectChange,
  ProjectScopeRuleMode,
  ProjectScopeRuleType,
  ProjectTriggerType,
  TargetType,
} from '@/common/enums/enum';

import {
  addProjectWorkflowTool,
  addTargetsTool,
  createProjectTool,
  updateProjectScopeTool,
} from './project-build.tools';
import type { ToolCallOptions, ToolScope } from './types';

const call = { toolCallId: 't1' } as ToolCallOptions;
const P1 = 'p1';

function setup(permissionKeys: string[] = ['*']) {
  const deps = {
    workspacesService: {
      getMembershipWithPermissions: jest.fn().mockResolvedValue({ permissionKeys }),
    },
    targetsService: {
      createMultipleTargets: jest.fn().mockResolvedValue({
        created: [{ id: 't-new', value: 'new.example.com' }],
        skipped: ['old.example.com'],
        totalRequested: 2,
      }),
    },
    conversationRepository: {
      manager: { query: jest.fn().mockResolvedValue([{ id: 't-old' }]) },
      update: jest.fn(),
    },
    toolsService: {
      getInstalledTools: jest.fn().mockResolvedValue({ data: [{ id: 'tool-a' }] }),
      installTool: jest.fn().mockResolvedValue({ tool: { name: 'nuclei' } }),
    },
    projectsService: {
      create: jest.fn().mockResolvedValue({ id: P1, name: 'Perimeter', totalAssets: 0 }),
      update: jest.fn().mockResolvedValue({ instruction: 'x' }),
      replaceScope: jest.fn().mockResolvedValue({ added: 1, removed: 0 }),
      addWorkflow: jest.fn().mockResolvedValue({ id: 'b1' }),
    },
    projectScopeService: {
      getScope: jest.fn().mockResolvedValue({
        rules: [
          { id: 'r1', mode: 'include', type: 'hostname', value: '*.a.com' },
          { id: 'r2', mode: 'exclude', type: 'hostname', value: 'b.a.com' },
        ],
      }),
    },
    projectTriggersService: { create: jest.fn() },
    eventBridge: { publishSafely: jest.fn() },
  };
  type Run = { execute: (p: unknown, o: ToolCallOptions) => Promise<unknown> };
  const run = (
    build: (d: never, w: string, s: ToolScope) => unknown,
    scope: ToolScope = { userId: 'u1', conversationId: 'c1' },
  ) => build(deps as never, 'w1', scope) as Run;
  return { deps, run };
}

const targets = [
  { value: 'new.example.com', type: TargetType.DOMAIN },
  { value: 'old.example.com', type: TargetType.DOMAIN },
];

describe('create_project', () => {
  it('builds the project from targets, tools and instruction, then links the chat', async () => {
    const { deps, run } = setup();

    const result = await run(createProjectTool).execute(
      {
        name: 'Perimeter',
        instruction: 'Staging only',
        targets,
        toolIds: ['tool-a', 'tool-b'],
        schedule: '0 2 * * *',
      },
      call,
    );

    // Only the tool the workspace lacks is installed
    expect(deps.toolsService.installTool).toHaveBeenCalledTimes(1);
    expect(deps.toolsService.installTool).toHaveBeenCalledWith({ toolId: 'tool-b' }, 'w1');
    expect(deps.projectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Perimeter',
        scopeRules: [
          { mode: ProjectScopeRuleMode.INCLUDE, type: ProjectScopeRuleType.TARGET, value: 't-new' },
          { mode: ProjectScopeRuleMode.INCLUDE, type: ProjectScopeRuleType.TARGET, value: 't-old' },
        ],
        tools: [{ toolId: 'tool-a' }, { toolId: 'tool-b' }],
        schedule: '0 2 * * *',
      }),
      'w1',
    );
    expect(deps.projectsService.update).toHaveBeenCalledWith(
      P1,
      { instruction: 'Staging only' },
      'w1',
    );
    expect(deps.conversationRepository.update).toHaveBeenCalledWith(
      { id: 'c1', workspaceId: 'w1' },
      { projectId: P1 },
    );
    expect(deps.eventBridge.publishSafely).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'project.created' }),
      expect.objectContaining({ resourceId: P1, actor: expect.objectContaining({ id: 'u1' }) }),
      expect.anything(),
    );
    expect(result).toMatchObject({
      projectId: P1,
      targetsCreated: ['new.example.com'],
      targetsExisting: ['old.example.com'],
      toolsInstalled: ['nuclei'],
      conversationLinked: true,
    });
  });

  it('needs target.write to add targets', async () => {
    const { deps, run } = setup(['project.write']);

    const result = await run(createProjectTool).execute({ name: 'P', targets }, call);

    expect(result).toContain('target.write');
    expect(deps.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(deps.projectsService.create).not.toHaveBeenCalled();
  });

  it('is refused in a chat that already belongs to a project', async () => {
    const { deps, run } = setup();

    const result = await run(createProjectTool, { userId: 'u1', projectId: 'p0' }).execute(
      { name: 'P' },
      call,
    );

    expect(result).toContain('already belongs to a project');
    expect(deps.projectsService.create).not.toHaveBeenCalled();
  });

  it('does nothing without a user to check', async () => {
    const { deps, run } = setup();

    expect(await run(createProjectTool, {}).execute({ name: 'P' }, call)).toContain(
      'no user',
    );
    expect(deps.projectsService.create).not.toHaveBeenCalled();
  });
});

describe('project edits', () => {
  it("adds targets to the locked project's scope", async () => {
    const { deps, run } = setup();

    await run(addTargetsTool, { userId: 'u1', projectId: P1 }).execute({ targets }, call);

    const rules = deps.projectsService.replaceScope.mock.calls[0][2] as unknown[];
    expect(deps.projectsService.replaceScope.mock.calls[0][0]).toBe(P1);
    expect(rules).toHaveLength(4);
    expect(rules.slice(2)).toEqual([
      { mode: 'include', type: 'target', value: 't-new' },
      { mode: 'include', type: 'target', value: 't-old' },
    ]);
  });

  it('keeps the other rules when one is removed', async () => {
    const { deps, run } = setup();

    await run(updateProjectScopeTool, { userId: 'u1', projectId: P1 }).execute(
      { removeRuleIds: ['r2'], add: [{ mode: 'include', type: 'cidr', value: '10.0.0.0/24' }] },
      call,
    );

    expect(deps.projectsService.replaceScope).toHaveBeenCalledWith(
      P1,
      'w1',
      [
        { mode: 'include', type: 'hostname', value: '*.a.com' },
        { mode: 'include', type: 'cidr', value: '10.0.0.0/24' },
      ],
      undefined,
    );
    expect(deps.eventBridge.publishSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: { change: ProjectChange.SCOPE } }),
      expect.anything(),
    );
  });

  it('adds a scheduled workflow from a template', async () => {
    const { deps, run } = setup();

    await run(addProjectWorkflowTool, { userId: 'u1', projectId: P1 }).execute(
      { template: 'discovery.yaml', schedule: '0 3 * * *' },
      call,
    );

    expect(deps.projectsService.addWorkflow).toHaveBeenCalledWith(P1, 'w1', {
      name: undefined,
      template: 'discovery.yaml',
    });
    expect(deps.projectTriggersService.create).toHaveBeenCalledWith(P1, 'w1', {
      projectWorkflowId: 'b1',
      type: ProjectTriggerType.CRON,
      cron: '0 3 * * *',
    });
  });
});
