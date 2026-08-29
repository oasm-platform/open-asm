import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    ['getToolSchema', 'GET /:id/schema', ['workspace.read']],
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

describe('ToolsController.getToolSchema', () => {
  let controller: ToolsController;
  let mockToolsService: Record<string, jest.Mock>;

  beforeEach(() => {
    mockToolsService = {
      getToolById: jest.fn(),
      getToolSchema: jest.fn(),
    };

    controller = new ToolsController(
      mockToolsService as any,
    );
  });

  it('should return configSchema with source "configSchema" when tool has configSchema', async () => {
    mockToolsService.getToolSchema.mockResolvedValue({
      schema: { type: 'object', properties: { templates: { type: 'string' } } },
      source: 'configSchema',
    });

    const result = await controller.getToolSchema({ id: 'tool-1' }, 'ws-001');

    expect(result).toEqual({
      schema: { type: 'object', properties: { templates: { type: 'string' } } },
      source: 'configSchema',
    });
    expect(mockToolsService.getToolSchema).toHaveBeenCalledWith('tool-1', 'ws-001');
  });

  it('should return inputsSchema with source "inputsSchema" when configSchema absent', async () => {
    mockToolsService.getToolSchema.mockResolvedValue({
      schema: { type: 'object', properties: { target: { type: 'string' } } },
      source: 'inputsSchema',
    });

    const result = await controller.getToolSchema({ id: 'tool-2' }, 'ws-001');

    expect(result).toEqual({
      schema: { type: 'object', properties: { target: { type: 'string' } } },
      source: 'inputsSchema',
    });
  });

  it('should throw NotFoundException when tool not found', async () => {
    mockToolsService.getToolSchema.mockRejectedValue(
      new NotFoundException('Tool with ID "bad-id" not found.'),
    );

    await expect(
      controller.getToolSchema({ id: 'bad-id' } as any, 'ws-001'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException for unknown connector slug', async () => {
    mockToolsService.getToolSchema.mockRejectedValue(
      new BadRequestException('Unknown connector slug "unknown-tool"'),
    );

    await expect(
      controller.getToolSchema({ id: 'tool-3' } as any, 'ws-001'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return null schema for non-connector tool', async () => {
    mockToolsService.getToolSchema.mockResolvedValue({
      schema: null,
      source: null,
    });

    const result = await controller.getToolSchema({ id: 'tool-4' }, 'ws-001');

    expect(result).toEqual({ schema: null, source: null });
  });
});
