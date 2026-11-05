import { AgentMode } from '@/common/enums/enum';

import { AgentTool, READ_ONLY_TOOLS } from '../agents.tools';
import { addAssetsToProjectTool } from './project.tools';
import type { ToolCallOptions } from './types';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const call = { toolCallId: 't1' } as ToolCallOptions;
const page = { data: [], total: 0, page: 1, limit: 100, pageCount: 0, hasNextPage: false };

function setup() {
  const services = {
    assetsService: { getManyAsssetServices: jest.fn().mockResolvedValue(page) },
    vulnerabilitiesService: { getVulnerabilities: jest.fn().mockResolvedValue(page) },
    projectResultsService: {
      vulnerabilities: jest.fn().mockResolvedValue(page),
      overview: jest.fn().mockResolvedValue({ totalAssets: 3 }),
    },
    statisticService: { getStatistics: jest.fn().mockResolvedValue({}) },
    projectsService: {
      addAssets: jest.fn().mockResolvedValue({ count: 1 }),
      getMany: jest.fn().mockResolvedValue(page),
      getById: jest.fn().mockResolvedValue({ id: P1 }),
    },
    projectFilesService: { readText: jest.fn() },
    // Agent mode also builds run_tool_connector: no connectors here
    connectorRegistry: { getAgentConnectors: jest.fn().mockReturnValue([]) },
  };
  const agentTool = Object.assign(
    Object.create(AgentTool.prototype),
    services,
  ) as AgentTool;
  // Ungated: no approval settings
  const tools = (mode: AgentMode, projectId?: string) =>
    agentTool.getTools('w1', mode, undefined, 'c1', undefined, projectId) as Record<
      string,
      { execute: (params: unknown, options: ToolCallOptions) => Promise<unknown> }
    >;
  return { services, tools };
}

const projectFilter = (projectId: string) => ({
  logic: 'and',
  items: [{ field: 'project', op: 'eq', value: projectId }],
});

describe('project-aware tools', () => {
  it('reads the whole workspace when no project is given', async () => {
    const { services, tools } = setup();

    await tools(AgentMode.ASK).enumerate_assets.execute({}, call);

    expect(services.assetsService.getManyAsssetServices).toHaveBeenCalledWith(
      expect.not.objectContaining({ filter: expect.anything() }),
      'w1',
    );
  });

  it('filters assets by the projectId the model passes', async () => {
    const { services, tools } = setup();

    await tools(AgentMode.ASK).enumerate_assets.execute({ projectId: P2 }, call);

    expect(services.assetsService.getManyAsssetServices).toHaveBeenCalledWith(
      expect.objectContaining({ filter: projectFilter(P2) }),
      'w1',
    );
  });

  it("stays in the conversation's project whatever projectId is passed", async () => {
    const { services, tools } = setup();
    const locked = tools(AgentMode.ASK, P1);

    await locked.enumerate_assets.execute({ projectId: P2 }, call);
    await locked.discover_vulnerabilities.execute({ projectId: P2, q: 'xss' }, call);
    await locked.gather_statistics.execute({}, call);

    expect(services.assetsService.getManyAsssetServices).toHaveBeenCalledWith(
      expect.objectContaining({ filter: projectFilter(P1) }),
      'w1',
    );
    expect(services.projectResultsService.vulnerabilities).toHaveBeenCalledWith(
      P1,
      'w1',
      expect.objectContaining({ search: 'xss' }),
    );
    expect(services.vulnerabilitiesService.getVulnerabilities).not.toHaveBeenCalled();
    expect(services.projectResultsService.overview).toHaveBeenCalledWith(P1, 'w1');
    expect(services.statisticService.getStatistics).not.toHaveBeenCalled();
  });

  it('lists only the locked project', async () => {
    const { services, tools } = setup();

    await tools(AgentMode.ASK, P1).list_projects.execute({}, call);

    expect(services.projectsService.getById).toHaveBeenCalledWith(P1, 'w1');
    expect(services.projectsService.getMany).not.toHaveBeenCalled();
  });

  it("pages a file of the conversation's project", async () => {
    const { services, tools } = setup();
    services.projectFilesService.readText.mockResolvedValue({
      id: 'f1',
      name: 'scope.md',
      content: 'x'.repeat(25_000),
      totalChars: 25_000,
    });

    const page = (await tools(AgentMode.ASK, P1).read_project_file.execute(
      { projectId: P2, fileId: P2, offset: 20_000 },
      call,
    )) as { content: string; nextOffset: number | null };

    expect(services.projectFilesService.readText).toHaveBeenCalledWith(P1, 'w1', P2);
    expect(page.content).toHaveLength(5_000);
    expect(page.nextOffset).toBeNull();
  });

  it('asks for a project when there is none to act on', async () => {
    const { services, tools } = setup();

    const result = await tools(AgentMode.AGENT).add_assets_to_project.execute(
      { assetIds: [P2] },
      call,
    );

    expect(result).toEqual(expect.stringContaining('no project given'));
    expect(services.projectsService.addAssets).not.toHaveBeenCalled();
  });

  const member = (permissionKeys: string[]) => ({
    getMembershipWithPermissions: jest.fn().mockResolvedValue({ permissionKeys }),
  });

  it('acts on the locked project for a member who may write it', async () => {
    const { services } = setup();
    const tool = addAssetsToProjectTool(
      { ...services, workspacesService: member(['project.write']) } as never,
      'w1',
      { projectId: P1, userId: 'u1' },
    ) as unknown as { execute: (p: unknown, o: ToolCallOptions) => Promise<unknown> };

    await tool.execute({ projectId: P2, assetIds: [P2] }, call);

    expect(services.projectsService.addAssets).toHaveBeenCalledWith(P1, 'w1', [P2]);
  });

  it('refuses a project action to a member who may only read', async () => {
    const { services } = setup();
    const tool = addAssetsToProjectTool(
      { ...services, workspacesService: member(['project.read']) } as never,
      'w1',
      { projectId: P1, userId: 'u1' },
    ) as unknown as { execute: (p: unknown, o: ToolCallOptions) => Promise<unknown> };

    expect(await tool.execute({ assetIds: [P2] }, call)).toContain('project.write');
    expect(services.projectsService.addAssets).not.toHaveBeenCalled();
  });

  it('offers the project actions only in Agent mode, and never as read-only', () => {
    const { tools } = setup();
    const actions = [
      'add_assets_to_project',
      'remove_assets_from_project',
      'run_project_workflow',
    ];

    expect(Object.keys(tools(AgentMode.ASK))).toEqual(
      expect.not.arrayContaining(actions),
    );
    expect(Object.keys(tools(AgentMode.AGENT))).toEqual(
      expect.arrayContaining([...actions, 'list_projects', 'inspect_project']),
    );
    expect(actions.some((name) => READ_ONLY_TOOLS.has(name))).toBe(false);
  });
});
