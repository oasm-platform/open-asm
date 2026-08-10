import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { ToolsController } from './tools.controller';

describe('ToolsController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['addToolToWorkspace', 'POST /add-to-workspace', ['workspace.write']],
    ['installTool', 'POST /install', ['workspace.write']],
    ['uninstallTool', 'POST /uninstall', ['workspace.write']],
    ['getManyTools', 'GET /', ['workspace.read']],
    ['getInstalledTools', 'GET /installed', ['workspace.read']],
    ['getToolById', 'GET /:id', ['workspace.read']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (ToolsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      ToolsController,
    ]);
    expect(required).toEqual(keys);
  });
});
