import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { TemplatesController } from './templates.controller';

describe('TemplatesController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['createTemplate', 'POST /', ['template.write']],
    ['uploadFile', 'POST /upload', ['template.write']],
    ['renameFile', 'PATCH /:templateId/rename', ['template.write']],
    ['getTemplateById', 'GET /:templateId', ['template.read']],
    ['getAllTemplates', 'GET /', ['template.read']],
    ['deleteTemplate', 'DELETE /:templateId', ['template.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (
      TemplatesController.prototype as Record<string, unknown>
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      TemplatesController,
    ]);
    expect(required).toEqual(keys);
  });
});
