import { HttpException } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';

import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { Reflector } from '@nestjs/core';

import { AsqErrorInterceptor } from './asq-error.interceptor';
import type { AsqSavedQueriesService } from './asq-saved-queries.service';
import { AttackSurfaceQueryController, MAX_QUERY_BODY_BYTES } from './attack-surface-query.controller';
import type { AttackSurfaceQueryService } from './attack-surface-query.service';
import { AsqError } from './domain/query-errors';

const reflector = new Reflector();
const permissionsOf = (method: keyof AttackSurfaceQueryController) =>
  reflector.get(WorkspacePermissions, AttackSurfaceQueryController.prototype[method] as () => unknown);

describe('AttackSurfaceQueryController', () => {
  const asq = { run: jest.fn().mockResolvedValue({ data: {}, meta: {} }), describe: jest.fn().mockReturnValue([]) };
  const controller = new AttackSurfaceQueryController(
    asq as unknown as AttackSurfaceQueryService,
    {} as AsqSavedQueriesService,
  );
  const req = { permissions: ['asset.read'] } as RequestWithMetadata;

  it.each([
    ['schema', []],
    ['query', []],
    ['explain', []],
    ['job', []],
    ['listSaved', ['report.read']],
    ['getSaved', ['report.read']],
    ['runSaved', ['report.read']],
    ['createSaved', ['report.write']],
    ['updateSaved', ['report.write']],
    ['deleteSaved', ['report.write']],
  ] as const)('%s requires %j (resource keys are checked per query)', (method, keys) => {
    expect(permissionsOf(method)).toEqual(keys);
  });

  it('runs with the guard-resolved permissions and workspace, never the body', async () => {
    await controller.query(req, 'w1', { queries: { a: { from: 'hosts' } } });
    expect(asq.run).toHaveBeenCalledWith({ workspaceId: 'w1', permissions: ['asset.read'], caller: 'http' }, { queries: { a: { from: 'hosts' } } });
  });

  it('refuses an oversized body', async () => {
    const huge = { queries: { a: { from: 'hosts', select: ['x'.repeat(MAX_QUERY_BODY_BYTES)] } } };
    await expect(controller.query(req, 'w1', huge)).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });

  it('turns AsqError into an HttpException with its status and body', async () => {
    const interceptor = new AsqErrorInterceptor();
    const error = new AsqError('PERMISSION_DENIED', 'Missing permission vulnerability.read for this query');
    const result = interceptor.intercept({} as never, { handle: () => throwError(() => error) });
    const thrown = await lastValueFrom(result).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(403);
    expect((thrown as HttpException).getResponse()).toEqual({ error: { code: 'PERMISSION_DENIED', message: error.message } });
  });
});
