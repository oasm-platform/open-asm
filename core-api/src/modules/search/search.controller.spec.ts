import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { SearchController } from './search.controller';

describe('SearchController workspace permission guards', () => {
  const reflector = new Reflector();

  it('searchAssetsTargets (GET /) requires workspace asset+target read access', () => {
    const handler = (
      SearchController.prototype as Record<string, unknown>
    ).searchAssetsTargets as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      SearchController,
    ]);
    expect(required).toEqual(['asset.read', 'target.read']);
  });

  it.each([
    ['getSearchHistory', 'GET /histories'],
    ['deleteSearchHistory', 'DELETE /histories/:id'],
    ['deleteAllSearchHistories', 'DELETE /histories'],
  ])(
    '%s (%s) is owner-scoped by the service, no workspace key required',
    (method, _route) => {
      const handler = (
        SearchController.prototype as Record<string, unknown>
      )[method] as object;
      expect(
        reflector.getAllAndOverride(WorkspacePermissions, [
          handler,
          SearchController,
        ]),
      ).toBeUndefined();
    },
  );
});