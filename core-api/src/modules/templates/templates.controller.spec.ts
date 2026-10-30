import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { TemplatesController } from './templates.controller';

describe('TemplatesController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getMany', 'GET /', ['artifact.read']],
    ['getContent', 'GET /:id/content', ['artifact.read']],
    ['create', 'POST /', ['artifact.write']],
    ['saveContent', 'PUT /:id/content', ['artifact.write']],
    ['rename', 'PATCH /:id', ['artifact.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (
      TemplatesController.prototype as unknown as Record<string, unknown>
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      TemplatesController,
    ]);
    expect(required).toEqual(keys);
  });
});
