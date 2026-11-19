import { IssueLinkResourceType, IssuePriority } from '@/common/enums/enum';
import { listIssuesSchema } from '@/mcp/mcp.schema';

import { agentFunctionWith } from '../agents.tools.testing';
import type { ToolCallOptions } from './types';
import { WorkspaceTools } from './workspace.tools';

const W = 'w1';
const V1 = '11111111-1111-4111-8111-111111111111';
const call = { toolCallId: 't1' } as ToolCallOptions;
const page = <T>(data: T[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
  pageCount: 1,
  hasNextPage: false,
});

type Executable = {
  execute: (params: unknown, options: ToolCallOptions) => Promise<unknown>;
};

describe('enumerate_open_issues', () => {
  function setup(userId?: string) {
    const deps = {
      issuesService: { getMany: jest.fn().mockResolvedValue(page([])) },
    };
    const tool = agentFunctionWith(
      WorkspaceTools,
      'enumerate_open_issues',
      deps,
      { workspaceId: W, userId },
    ) as unknown as Executable;
    return { deps, tool };
  }

  it('passes priority, assignee, overdue and link filters with the user', async () => {
    const { deps, tool } = setup('u1');
    const params = listIssuesSchema.parse({
      priority: [IssuePriority.P1],
      mine: true,
      overdue: true,
      resourceType: IssueLinkResourceType.VULNERABILITY,
      resourceId: V1,
    });

    await tool.execute(params, call);

    expect(deps.issuesService.getMany).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: [IssuePriority.P1],
        mine: true,
        overdue: true,
        resourceType: IssueLinkResourceType.VULNERABILITY,
        resourceId: V1,
      }),
      W,
      'u1',
    );
  });

  it('answers "mine" without a user instead of failing the call', async () => {
    const { deps, tool } = setup();

    const result = await tool.execute({ mine: true }, call);

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(deps.issuesService.getMany).not.toHaveBeenCalled();
  });
});
