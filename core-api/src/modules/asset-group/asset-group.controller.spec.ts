import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { AssetGroupController } from './asset-group.controller';

describe('AssetGroupController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getAll', 'GET /', ['group.read']],
    ['getById', 'GET /:id', ['group.read']],
    ['updateAssetGroupById', 'PATCH /:id', ['group.write']],
    ['create', 'POST /', ['group.write']],
    ['addManyWorkflows', 'POST /:groupId/workflows', ['group.write']],
    ['addManyAssets', 'POST /:groupId/assets', ['group.write']],
    ['removeManyWorkflows', 'DELETE /:groupId/workflows', ['group.write']],
    ['removeManyAssets', 'DELETE /:groupId/assets', ['group.write']],
    ['delete', 'DELETE /:id', ['group.write']],
    ['getAssetsByAssetGroupsId', 'GET /:assetGroupId/assets', ['group.read']],
    [
      'getAssetsNotInAssetGroup',
      'GET /:assetGroupId/assets/not-in-group',
      ['group.read'],
    ],
    ['updateAssetGroupWorkflow', 'PATCH /workflows/:id', ['group.write']],
    [
      'runGroupWorkflowScheduler',
      'POST /workflows/:id/run',
      ['workflow.write'],
    ],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (
      AssetGroupController.prototype as Record<string, unknown>
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AssetGroupController,
    ]);
    expect(required).toEqual(keys);
  });
});
