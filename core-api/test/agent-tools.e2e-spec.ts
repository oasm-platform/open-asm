// First: AppModule loads the module graph in the order main.ts does, so the
// agents files below are already evaluated when this spec imports them.
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { AgentMode } from '@/modules/agents/enums/agent.enums';
import {
  AgentTool,
  MCP_TOOLS,
  TOOL_PERMISSIONS,
} from '@/modules/agents/agents.tools';
import type { DataSource } from 'typeorm';
import {
  cleanupE2eData,
  createUser,
  createUserWithWorkspace,
} from './helpers/workspace';

type Runnable = {
  execute: (
    input: unknown,
    options: { toolCallId: string; messages: never[] },
  ) => Promise<unknown>;
};
type Tools = Record<string, Runnable>;

const call = { toolCallId: 'e2e-call', messages: [] };

/**
 * The agent's tool set as the running app builds it: the @AgentFunction
 * classes resolved from the real Nest container, called against Postgres.
 *
 * Proofs:
 *  1. Every built-in tool, the MCP surface and the per-run families are
 *     built from the decorated classes of the running app.
 *  2. A lookup runs through the real services for the workspace's owner.
 *  3. The same lookup is refused to a user who is not a member.
 *  4. The MCP tools run unwrapped (no user, no approval flow).
 */
describe('Agent tools in the running app', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let dataSource: DataSource;
  let agentTool: AgentTool;
  let workspaceId: string;
  let userId: string;
  let outsiderId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.dataSource;
    agentTool = app.app.get(AgentTool);

    const ctx = await createUserWithWorkspace(app.server, 'agent-tools');
    workspaceId = ctx.workspace.id;
    userId = ctx.user.userId;
    outsiderId = (await createUser(app.server)).userId;
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspaceId],
      userIds: [userId, outsiderId],
    });
    await closeTestApp(app.app);
  });

  it('builds every tool from the decorated classes of the container', () => {
    const ask = Object.keys(agentTool.getTools(workspaceId, userId, AgentMode.ASK));
    const agent = Object.keys(
      agentTool.getTools(workspaceId, userId, AgentMode.AGENT, undefined, 'c1'),
    );

    expect(ask).toHaveLength(25);
    expect(agent).toEqual(
      expect.arrayContaining([
        ...ask,
        'create_project',
        'propose_vulnerability',
        'execute_remote_command',
        'read_tool_output',
      ]),
    );
    expect(agent.filter((name) => !(name in TOOL_PERMISSIONS))).toEqual([]);
    expect(Object.keys(agentTool.getMcpTools(workspaceId)).sort()).toEqual(
      [...MCP_TOOLS].sort(),
    );
    expect(Object.keys(agentTool.getTodoTools('c1'))).toEqual([
      'formulate_plan',
      'transition_step',
      'append_step',
      'scrap_plan',
    ]);
    expect(Object.keys(agentTool.getMemoryTools(workspaceId, userId, 'c1'))).toEqual([
      'stm_write',
      'stm_read',
      'stm_list',
      'ltm_write',
      'ltm_read',
      'ltm_delete',
    ]);
    expect(
      Object.keys(agentTool.getArtifactTools(workspaceId, userId, 'c1')),
    ).toEqual(['save_file', 'save_template']);
  });

  it("runs a lookup through the real services for the workspace's owner", async () => {
    const tools = agentTool.getTools(workspaceId, userId, AgentMode.ASK) as Tools;

    const result = await tools.retrieve_targets.execute({}, call);

    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({ data: expect.any(Array) });
  });

  it('refuses the same lookup to a user who is not a member', async () => {
    const tools = agentTool.getTools(workspaceId, outsiderId, AgentMode.ASK) as Tools;

    await expect(tools.retrieve_targets.execute({}, call)).resolves.toEqual({
      error: expect.stringContaining('not a member'),
    });
  });

  it('serves the MCP tools unwrapped', async () => {
    const tools = agentTool.getMcpTools(workspaceId) as Tools;

    const result = await tools.list_projects.execute({}, call);

    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({ data: expect.any(Array) });
  });
});
