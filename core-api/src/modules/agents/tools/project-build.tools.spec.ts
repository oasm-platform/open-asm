import { NotFoundException } from '@nestjs/common';

import {
  DataKind,
  ProjectChange,
  ProjectScopeRuleMode,
  ProjectScopeRuleType,
  ProjectTriggerType,
  TargetType,
  ToolCategory,
  WorkerType,
} from '@/common/enums/enum';
import { _resetValidatorCache } from '@/modules/tools/validators/tool-config-profiles.validator';

import {
  addProjectWorkflowTool,
  addTargetsTool,
  createProjectTool,
  inspectPipelineToolTool,
  updateProjectScopeTool,
} from './project-build.tools';
import type { ToolCallOptions, ToolScope } from './types';

const call = { toolCallId: 't1' } as ToolCallOptions;
const P1 = 'p1';

const ffufSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    wordlist: { type: 'string', description: 'Wordlist of paths to try.' },
    matchRegex: { type: 'string', description: 'Keep only URLs matching this regex.' },
    threads: { type: 'integer', minimum: 1, default: 40 },
  },
};
const acunetixSchema = {
  type: 'object',
  required: ['url', 'apiKey'],
  properties: {
    url: { type: 'string', description: 'Base URL of the Acunetix instance.' },
    apiKey: { type: 'string', 'ui:widget': 'password' },
    maxScanTime: { type: 'integer', minimum: 0 },
  },
};
/** tool-a: built-in httpx; tool-b: ffuf (no required config); tool-c: acunetix. */
const TOOLS: Record<string, Record<string, unknown>> = {
  'tool-a': {
    id: 'tool-a',
    name: 'httpx',
    type: WorkerType.BUILT_IN,
    description: 'HTTP probe',
    categories: [
      { name: ToolCategory.HTTP_PROBE, targetTypes: [], inputs: [DataKind.SERVICE], produces: [DataKind.WEB] },
    ],
  },
  'tool-b': {
    id: 'tool-b',
    name: 'ffuf',
    type: WorkerType.CONNECTOR,
    description: 'Web fuzzer',
    categories: [{ name: ToolCategory.URL_DISCOVERY, targetTypes: [] }],
  },
  'tool-c': {
    id: 'tool-c',
    name: 'acunetix',
    type: WorkerType.CONNECTOR,
    description: 'Web scanner',
    categories: [{ name: ToolCategory.VULNERABILITIES, targetTypes: [] }],
  },
};
const SCHEMAS: Record<string, Record<string, unknown>> = {
  ffuf: ffufSchema,
  acunetix: acunetixSchema,
};

function setup(permissionKeys: string[] = ['*']) {
  const deps = {
    connectorRegistry: {
      getConnector: jest.fn((slug: string) =>
        SCHEMAS[slug] ? { slug, configSchema: SCHEMAS[slug] } : null,
      ),
      getConnectorSchema: jest.fn((slug: string) => SCHEMAS[slug] ?? null),
    },
    toolConfigProfiles: {
      list: jest.fn((_w: string, toolId: string) =>
        Promise.resolve(
          toolId === 'tool-c'
            ? [
                {
                  id: 'prof-c',
                  name: 'prod',
                  isDefault: true,
                  config: { url: 'https://acu.local', apiKey: '****abcd' },
                },
              ]
            : [],
        ),
      ),
    },
    workspacesService: {
      getMembershipWithPermissions: jest.fn().mockResolvedValue({ permissionKeys }),
    },
    targetsService: {
      // Like the real service: rejects a value that already exists
      createMultipleTargets: jest.fn(
        (dto: { targets: Array<{ value: string }> }) =>
          dto.targets.some((t) => t.value === 'old.example.com')
            ? Promise.reject(new Error('Target already exists: old.example.com'))
            : Promise.resolve({
                created: [{ id: 't-new', value: 'new.example.com' }],
                skipped: [],
                totalRequested: dto.targets.length,
              }),
      ),
      findByWorkspaceAndValues: jest.fn((_w: string, values: string[]) =>
        Promise.resolve(
          values.includes('old.example.com')
            ? [{ id: 't-old', value: 'old.example.com' }]
            : [],
        ),
      ),
    },
    conversationRepository: {
      manager: { query: jest.fn().mockResolvedValue([{ id: 't-old' }]) },
      update: jest.fn(),
    },
    toolsService: {
      getInstalledTools: jest.fn().mockResolvedValue({ data: [{ id: 'tool-a' }] }),
      installTool: jest.fn().mockResolvedValue({ tool: { name: 'nuclei' } }),
      getToolById: jest.fn((id: string, workspaceId?: string) => {
        const tool = TOOLS[id];
        if (!tool) {
          return Promise.reject(new NotFoundException(`Tool with ID "${id}" not found.`));
        }
        return Promise.resolve(
          workspaceId
            ? { ...tool, isInstalled: id !== 'tool-b', isReady: id !== 'tool-b' }
            : { ...tool },
        );
      }),
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

  it('creates only the new targets and reuses the existing ones', async () => {
    const { deps, run } = setup();

    await run(createProjectTool).execute({ name: 'Perimeter', targets }, call);

    expect(deps.targetsService.createMultipleTargets).toHaveBeenCalledWith(
      { targets: [{ value: 'new.example.com', type: TargetType.DOMAIN }] },
      'w1',
      expect.anything(),
    );
  });

  it('takes a project over targets that all exist already', async () => {
    const { deps, run } = setup();

    const result = await run(createProjectTool).execute(
      { name: 'P', targets: [{ value: 'old.example.com', type: TargetType.DOMAIN }] },
      call,
    );

    expect(deps.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(deps.projectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeRules: [
          { mode: ProjectScopeRuleMode.INCLUDE, type: ProjectScopeRuleType.TARGET, value: 't-old' },
        ],
      }),
      'w1',
    );
    expect(result).toMatchObject({ targetsCreated: [], targetsExisting: ['old.example.com'] });
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

describe('pipeline steps with config', () => {
  beforeEach(() => _resetValidatorCache());

  it('passes stage, category, input, inline config and profile of each step', async () => {
    const { deps, run } = setup();

    const result = await run(createProjectTool).execute(
      {
        name: 'Login paths',
        tools: [
          { toolId: 'tool-a', stage: 1 },
          {
            toolId: 'tool-b',
            stage: 2,
            category: ToolCategory.URL_DISCOVERY,
            input: [DataKind.WEB],
            config: { matchRegex: '(?i)(login|signin|auth)', threads: 10 },
          },
          { toolId: 'tool-c', stage: 3, configProfileId: 'prof-c', config: { maxScanTime: 30 } },
        ],
      },
      call,
    );

    expect(result).toMatchObject({ projectId: P1 });
    expect(deps.projectsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          { toolId: 'tool-a', stage: 1 },
          {
            toolId: 'tool-b',
            stage: 2,
            category: ToolCategory.URL_DISCOVERY,
            input: [DataKind.WEB],
            config: { matchRegex: '(?i)(login|signin|auth)', threads: 10 },
          },
          { toolId: 'tool-c', stage: 3, configProfileId: 'prof-c', config: { maxScanTime: 30 } },
        ],
      }),
      'w1',
    );
  });

  it.each([
    ['a secret field', { toolId: 'tool-c', config: { apiKey: 'k' } }, 'apiKey'],
    ['an unknown field', { toolId: 'tool-b', config: { colour: 'red' } }, 'colour'],
    ['a value of the wrong type', { toolId: 'tool-b', config: { threads: 'many' } }, 'threads'],
    ['config on a built-in tool', { toolId: 'tool-a', config: { threads: 1 } }, 'built-in'],
    ['a profile of another tool', { toolId: 'tool-b', configProfileId: 'prof-c' }, 'prof-c'],
    ['an unknown profile', { toolId: 'tool-c', configProfileId: 'nope' }, 'nope'],
    ['an unknown tool', { toolId: 'tool-x' }, 'tool-x'],
    ['an input kind the tool does not take', { toolId: 'tool-a', input: [DataKind.HOST] }, 'cannot take host'],
    ['a category the tool lacks', { toolId: 'tool-b', category: ToolCategory.PORTS_SCANNER }, 'ports_scanner'],
  ])('refuses %s before changing anything', async (_case, step, mention) => {
    const { deps, run } = setup();

    const result = await run(createProjectTool).execute(
      { name: 'P', targets, tools: [step] },
      call,
    );

    expect(typeof result).toBe('string');
    expect(result).toContain('Not executed');
    expect(result).toContain(mention);
    expect(deps.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(deps.toolsService.installTool).not.toHaveBeenCalled();
    expect(deps.projectsService.create).not.toHaveBeenCalled();
  });

  it('names the required fields a connector without a profile still lacks', async () => {
    const { deps, run } = setup();
    deps.toolConfigProfiles.list.mockResolvedValue([]);

    const result = await run(createProjectTool).execute(
      { name: 'P', tools: [{ toolId: 'tool-c', config: { url: 'https://acu.local' } }] },
      call,
    );

    expect(result).toContain('apiKey');
    expect(result).toContain('config profile');
    expect(deps.projectsService.create).not.toHaveBeenCalled();
  });

  it('refuses toolIds and tools together', async () => {
    const { deps, run } = setup();

    const result = await run(createProjectTool).execute(
      { name: 'P', toolIds: ['tool-a'], tools: [{ toolId: 'tool-a' }] },
      call,
    );

    expect(result).toContain('either toolIds or tools');
    expect(deps.projectsService.create).not.toHaveBeenCalled();
  });

  it('adds a configured workflow to a project', async () => {
    const { deps, run } = setup();

    await run(addProjectWorkflowTool, { userId: 'u1', projectId: P1 }).execute(
      { tools: [{ toolId: 'tool-b', config: { wordlist: 'login.txt' } }] },
      call,
    );

    expect(deps.projectsService.addWorkflow).toHaveBeenCalledWith(P1, 'w1', {
      name: undefined,
      tools: [{ toolId: 'tool-b', config: { wordlist: 'login.txt' } }],
    });
  });
});

describe('inspect_pipeline_tool', () => {
  it('describes what a connector takes, finds and is configured with', async () => {
    const { deps, run } = setup();

    const result = await run(inspectPipelineToolTool).execute({ toolId: 'tool-c' }, call);

    expect(deps.toolsService.getToolById).toHaveBeenCalledWith('tool-c', 'w1');
    expect(result).toEqual({
      id: 'tool-c',
      name: 'acunetix',
      type: WorkerType.CONNECTOR,
      description: 'Web scanner',
      isInstalled: true,
      categories: [
        {
          name: ToolCategory.VULNERABILITIES,
          inputs: [DataKind.HOST],
          produces: [DataKind.VULNERABILITY],
        },
      ],
      config: [
        { name: 'url', type: 'string', required: true, description: 'Base URL of the Acunetix instance.' },
        { name: 'apiKey', type: 'string', required: true, secret: true },
        { name: 'maxScanTime', type: 'integer', required: false },
      ],
      profiles: [
        {
          id: 'prof-c',
          name: 'prod',
          isDefault: true,
          configuredFields: ['url', 'apiKey'],
          missingRequired: [],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('abcd');
  });

  it('says a built-in tool takes no config', async () => {
    const { run } = setup();

    const result = await run(inspectPipelineToolTool).execute({ toolId: 'tool-a' }, call);

    expect(result).toMatchObject({
      name: 'httpx',
      type: WorkerType.BUILT_IN,
      categories: [
        { name: ToolCategory.HTTP_PROBE, inputs: [DataKind.SERVICE], produces: [DataKind.WEB] },
      ],
      config: [],
      profiles: [],
    });
  });

  it('answers an unknown tool with an error', async () => {
    const { run } = setup();

    await expect(
      run(inspectPipelineToolTool).execute({ toolId: 'tool-x' }, call),
    ).resolves.toHaveProperty('error');
  });
});
