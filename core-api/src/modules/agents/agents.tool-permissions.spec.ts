import { NotFoundException } from '@nestjs/common';

import { AgentApprovalMode, AgentMode } from '@/modules/agents/enums/agent.enums';

import { TOOL_PERMISSIONS } from './agents.tools';
import { agentToolWith } from './agents.tools.testing';
import type { ToolCallOptions } from './tools/types';

const call = { toolCallId: 't1' } as ToolCallOptions;
const page = { data: [], total: 0, page: 1, limit: 100, pageCount: 0, hasNextPage: false };

type Runnable = { execute: (params: unknown, options: ToolCallOptions) => Promise<unknown> };

function setup(permissionKeys: string[] | Error = ['*']) {
  const services = {
    jobsRegistryService: { getManyJobs: jest.fn().mockResolvedValue(page) },
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
    const { services, tools } = setup(['job.read']);

    await tools().review_jobs.execute({}, call);

    expect(services.workspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      'w1',
      'u1',
    );
    expect(services.jobsRegistryService.getManyJobs).toHaveBeenCalled();
  });

  it('refuses a tool to a member the API would refuse', async () => {
    const { services, tools } = setup(['asset.read']);

    const result = await tools().review_jobs.execute({}, call);

    expect(result).toEqual({ error: expect.stringContaining('job.read') });
    expect(services.jobsRegistryService.getManyJobs).not.toHaveBeenCalled();
  });

  it('lets {domain}.write satisfy a read tool, like the API guard', async () => {
    const { services, tools } = setup(['job.write']);

    await tools().review_jobs.execute({}, call);

    expect(services.jobsRegistryService.getManyJobs).toHaveBeenCalled();
  });

  it('refuses every tool to a user who is no longer a member', async () => {
    const { services, tools } = setup(new NotFoundException());

    const result = await tools().review_jobs.execute({}, call);

    expect(result).toEqual({ error: expect.stringContaining('not a member') });
    expect(services.jobsRegistryService.getManyJobs).not.toHaveBeenCalled();
  });

  it('checks the permission before the guard and the approval prompt', async () => {
    const { services, tools } = setup([]);

    await tools(AgentMode.AGENT, {
      userId: 'u1',
      mode: AgentApprovalMode.MANUAL,
    }).review_jobs.execute({}, call);

    expect(services.guard.evaluate).not.toHaveBeenCalled();
    expect(services.approvals.authorize).not.toHaveBeenCalled();
  });

  it('checks the permission when the tools run without approval (read-only subagents)', async () => {
    const { services, tools } = setup([]);

    await tools(AgentMode.AGENT).review_jobs.execute({}, call);

    expect(services.jobsRegistryService.getManyJobs).not.toHaveBeenCalled();
  });

  it('reads the permissions at call time, so a revoked key stops the next call', async () => {
    const { services, tools } = setup(['job.read']);
    const reviewJobs = tools().review_jobs;

    await reviewJobs.execute({}, call);
    services.workspacesService.getMembershipWithPermissions.mockResolvedValue({
      permissionKeys: [],
    });
    await reviewJobs.execute({}, call);

    expect(services.jobsRegistryService.getManyJobs).toHaveBeenCalledTimes(1);
  });
});
