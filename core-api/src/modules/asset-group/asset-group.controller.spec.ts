import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { AssetGroupController } from './asset-group.controller';

describe('AssetGroupController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getAll', 'GET /', ['project.read']],
    ['getById', 'GET /:id', ['project.read']],
    ['updateAssetGroupById', 'PATCH /:id', ['project.write']],
    ['create', 'POST /', ['project.write']],
    ['addManyWorkflows', 'POST /:groupId/workflows', ['project.write']],
    ['addManyAssets', 'POST /:groupId/assets', ['project.write']],
    ['removeManyWorkflows', 'DELETE /:groupId/workflows', ['project.write']],
    ['removeManyAssets', 'DELETE /:groupId/assets', ['project.write']],
    ['delete', 'DELETE /:id', ['project.write']],
    ['getAssetsByAssetGroupsId', 'GET /:assetGroupId/assets', ['project.read']],
    [
      'getAssetsNotInAssetGroup',
      'GET /:assetGroupId/assets/not-in-group',
      ['project.read'],
    ],
    ['updateAssetGroupWorkflow', 'PATCH /workflows/:id', ['project.write']],
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
