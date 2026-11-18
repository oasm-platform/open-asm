import type { Tool } from 'ai';

import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';

import { agentFunctionWith } from '../agents.tools.testing';
import { AttackSurfaceQueryTools } from './attack-surface-query.tools';

const call = (tool: Tool, input: unknown) =>
  (tool.execute as (input: unknown, options: unknown) => Promise<unknown>)(input, {
    toolCallId: 't1',
    messages: [],
  });

function setup(permissionKeys = ['asset.read']) {
  const attackSurfaceQuery = {
    run: jest.fn().mockResolvedValue({ data: {}, meta: {} }),
    describe: jest.fn().mockReturnValue([{ name: 'hosts' }]),
  };
  const workspacesService = {
    getMembershipWithPermissions: jest.fn().mockResolvedValue({ membership: {}, permissionKeys }),
  };
  return { attackSurfaceQuery, workspacesService };
}

describe('AttackSurfaceQueryTools', () => {
  it('runs with the member permissions and the conversation project, never input scope', async () => {
    const services = setup(['asset.read', 'vulnerability.read']);
    const tool = agentFunctionWith(AttackSurfaceQueryTools, 'query_attack_surface', services, {
      workspaceId: 'w1',
      userId: 'u1',
      projectId: 'p1',
    });
    await call(tool, { queries: { a: { from: 'hosts' } } });
    expect(services.workspacesService.getMembershipWithPermissions).toHaveBeenCalledWith('w1', 'u1');
    expect(services.attackSurfaceQuery.run).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w1',
        permissions: ['asset.read', 'vulnerability.read'],
        caller: 'agent',
        projectId: 'p1',
      }),
      { queries: { a: { from: 'hosts' } } },
    );
  });

  it('uses the fixed read set on the MCP server (no member)', async () => {
    const services = setup();
    const tool = agentFunctionWith(AttackSurfaceQueryTools, 'query_attack_surface', services, { workspaceId: 'w1' });
    await call(tool, { queries: { a: { from: 'hosts' } } });
    expect(services.workspacesService.getMembershipWithPermissions).not.toHaveBeenCalled();
    expect(services.attackSurfaceQuery.run).toHaveBeenCalledWith(
      expect.objectContaining({ caller: 'mcp', permissions: ['asset.read', 'vulnerability.read', 'target.read'] }),
      expect.anything(),
    );
  });

  it('returns query errors as data, so the model can fix its query', async () => {
    const services = setup();
    services.attackSurfaceQuery.run.mockRejectedValue(
      new AsqError('INVALID_QUERY', '1 issue(s) in the query', {
        issues: [{ path: 'queries.a.from', code: 'UNKNOWN_RESOURCE', message: 'nope' }],
      }),
    );
    const tool = agentFunctionWith(AttackSurfaceQueryTools, 'query_attack_surface', services, { workspaceId: 'w1', userId: 'u1' });
    await expect(call(tool, { queries: { a: { from: 'x' } } })).resolves.toEqual({
      error: expect.objectContaining({ code: 'INVALID_QUERY', issues: [expect.objectContaining({ path: 'queries.a.from' })] }),
    });
  });

  it('describes the schema the member may read, compact', async () => {
    const services = setup();
    const tool = agentFunctionWith(AttackSurfaceQueryTools, 'describe_attack_surface', services, { workspaceId: 'w1', userId: 'u1' });
    await expect(call(tool, {})).resolves.toEqual({ resources: [{ name: 'hosts' }] });
    expect(services.attackSurfaceQuery.describe).toHaveBeenCalledWith(expect.objectContaining({ permissions: ['asset.read'] }), {
      compact: true,
    });
  });
});
