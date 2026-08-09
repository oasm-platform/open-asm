import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { InternalNetworksController } from './internal-networks.controller';

describe('InternalNetworksController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getManyInternalNetworks', 'GET /', ['network.read']],
    ['createInternalNetwork', 'POST /', ['network.write']],
    [
      'createTargetsFromInterfaces',
      'POST /targets',
      ['target.write'],
    ],
    [
      'getManyNetworkInterfaces',
      'GET /:id/network-interfaces',
      ['network.read'],
    ],
    ['getInternalNetworkById', 'GET /:id', ['network.read']],
    ['updateInternalNetworkById', 'PATCH /:id', ['network.write']],
    ['deleteInternalNetwork', 'DELETE /:id', ['network.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (
      InternalNetworksController.prototype as Record<string, unknown>
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      InternalNetworksController,
    ]);
    expect(required).toEqual(keys);
  });
});
