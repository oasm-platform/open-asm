import { NotFoundException } from '@nestjs/common';

import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';

import { TOOL_PERMISSIONS } from './agents.tools';
import { agentToolWith } from './agents.tools.testing';
import type { ToolCallOptions } from './tools/types';

const call = { toolCallId: 't1' } as ToolCallOptions;
const page = { data: [], total: 0, page: 1, limit: 100, pageCount: 0, hasNextPage: false };

type Runnable = { execute: (params: unknown, options: ToolCallOptions) => Promise<unknown> };

function setup(permissionKeys: string[] | Error = ['*']) {
  const services = {
    targetsService: { getTargetsInWorkspace: jest.fn().mockResolvedValue(page) },
    assetsService: { getManyAsssetServices: jest.fn().mockResolvedValue(page) },
    connectorRegistry: { getAgentConnectors: jest.fn().mockReturnValue([]) },
    workspacesService: {
      getMembershipWithPermissions:
        permissionKeys instanceof Error
          ? jest.fn().mockRejectedValue(permissionKeys)
          : jest.fn().mockResolvedValue({ permissionKeys }),
    },
    guard: { evaluate: jest.fn().mockResolvedValue({ action: 'pass' }) },
    approvals: { authorize: jest.fn().mockResolvedValue({ allowed: true }) },
  };
  const agentTool = agentToolWith(services);
  const tools = (
    mode = AgentMode.AGENT,
    approval?: { userId: string; mode: AgentApprovalMode },
  ) =>
    agentTool.getTools('w1', 'u1', mode, undefined, 'c1', approval) as Record<
      string,
      Runnable
    >;
  return { services, tools };
}

describe('AgentTool workspace permissions', () => {
  it('maps every built-in tool to the permission of its API route', () => {
    const { tools } = setup();
    const offered = Object.keys(tools(AgentMode.AGENT));

    expect(offered.filter((name) => !(name in TOOL_PERMISSIONS))).toEqual([]);
  });

  it('runs a tool for a member holding its permission', async () => {
    const { services, tools } = setup(['target.read']);

    await tools().retrieve_targets.execute({}, call);

    expect(services.workspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      'w1',
      'u1',
    );
    expect(services.targetsService.getTargetsInWorkspace).toHaveBeenCalled();
  });

  it('refuses a tool to a member the API would refuse', async () => {
    const { services, tools } = setup(['asset.read']);

    const result = await tools().retrieve_targets.execute({}, call);

    expect(result).toEqual({ error: expect.stringContaining('target.read') });
    expect(services.targetsService.getTargetsInWorkspace).not.toHaveBeenCalled();
  });

  it('lets {domain}.write satisfy a read tool, like the API guard', async () => {
    const { services, tools } = setup(['target.write']);

    await tools().retrieve_targets.execute({}, call);

    expect(services.targetsService.getTargetsInWorkspace).toHaveBeenCalled();
  });

  it('refuses every tool to a user who is no longer a member', async () => {
    const { services, tools } = setup(new NotFoundException());

    const result = await tools().enumerate_assets.execute({}, call);

    expect(result).toEqual({ error: expect.stringContaining('not a member') });
    expect(services.assetsService.getManyAsssetServices).not.toHaveBeenCalled();
  });

  it('checks the permission before the guard and the approval prompt', async () => {
    const { services, tools } = setup([]);

    await tools(AgentMode.AGENT, {
      userId: 'u1',
      mode: AgentApprovalMode.MANUAL,
    }).retrieve_targets.execute({}, call);

    expect(services.guard.evaluate).not.toHaveBeenCalled();
    expect(services.approvals.authorize).not.toHaveBeenCalled();
  });

  it('checks the permission when the tools run without approval (read-only subagents)', async () => {
    const { services, tools } = setup([]);

    await tools(AgentMode.AGENT).retrieve_targets.execute({}, call);

    expect(services.targetsService.getTargetsInWorkspace).not.toHaveBeenCalled();
  });

  it('reads the permissions at call time, so a revoked key stops the next call', async () => {
    const { services, tools } = setup(['target.read']);
    const retrieve = tools().retrieve_targets;

    await retrieve.execute({}, call);
    services.workspacesService.getMembershipWithPermissions.mockResolvedValue({
      permissionKeys: [],
    });
    await retrieve.execute({}, call);

    expect(services.targetsService.getTargetsInWorkspace).toHaveBeenCalledTimes(1);
  });
});
