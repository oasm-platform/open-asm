import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { TargetsController } from './targets.controller';

describe('TargetsController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['createMultipleTargets', 'POST /bulk', ['target.write']],
    ['getTargetsInWorkspace', 'GET /', ['target.read']],
    ['exportTargetsToCSV', 'GET /export', ['target.read']],
    ['getTargetById', 'GET /:id', ['target.read']],
    ['deleteTarget', 'DELETE /:id/workspace/:workspaceId', ['target.write']],
    ['reScanTarget', 'POST /:id/re-scan', ['target.write']],
    ['updateTarget', 'PATCH /:id', ['target.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (TargetsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      TargetsController,
    ]);
    expect(required).toEqual(keys);
  });
});
