import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { AssetsController } from './assets.controller';

describe('AssetsController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getAssetsInWorkspace', 'GET /', ['asset.read']],
    ['getIpAssets', 'GET /ip', ['asset.read']],
    ['getHostAssets', 'GET /host', ['asset.read']],
    ['getPortAssets', 'GET /port', ['asset.read']],
    ['getTechnologyAssets', 'GET /tech', ['asset.read']],
    ['getStatusCodeAssets', 'GET /status-code', ['asset.read']],
    ['getTlsAssets', 'GET /tls', ['asset.read']],
    ['generateServiceTags', 'POST /service/tag/generate', ['asset.write']],
    ['getAssetById', 'GET /:id', ['asset.read']],
    ['updateAssetById', 'PATCH /:id', ['asset.write']],
    ['toggleAsset', 'POST /toggle', ['asset.write']],
    ['exportServicesToCSV', 'GET /services/export', ['asset.read']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (AssetsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      AssetsController,
    ]);
    expect(required).toEqual(keys);
  });
});
