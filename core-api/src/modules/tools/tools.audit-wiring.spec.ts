import { Reflector } from '@nestjs/core';
import { PUBLISH_EVENT_KEY, type PublishEventConfig } from '../event-bridge/publishing/publish-event.decorator';
import { ToolsController } from './tools.controller';

describe('ToolsController audit wiring', () => {
  const reflector = new Reflector();

  const auditConfig = (method: () => unknown) =>
    reflector.getAllAndOverride<PublishEventConfig & { event: unknown }>(
      PUBLISH_EVENT_KEY,
      [method, ToolsController],
    );

  it.each([
    ['installTool', 'tool.installed'],
    ['uninstallTool', 'tool.uninstalled'],
  ])('%s is wired to the %s event', (method, action) => {
    expect(auditConfig(ToolsController.prototype[method])).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ name: action }),
      }),
    );
  });

  it('installTool records the tool id and name from the result', () => {
    const config = auditConfig(ToolsController.prototype.installTool);
    const result = { id: 'wt-1', tool: { id: 'tool-1', name: 'nuclei' } };
    expect(config?.resourceId?.(result)).toBe('tool-1');
    expect(config?.changes?.({ toolId: 'tool-1' }, result)).toEqual({
      tool: { after: 'nuclei' },
    });
    expect(config?.resourceId?.(undefined)).toBeUndefined();
  });

  it('uninstallTool records the tool id and name from the result', () => {
    const config = auditConfig(ToolsController.prototype.uninstallTool);
    const result = { message: 'ok', toolId: 'tool-1', toolName: 'nuclei' };
    expect(config?.resourceId?.(result)).toBe('tool-1');
    expect(config?.changes?.({ toolId: 'tool-1' }, result)).toEqual({
      tool: { before: 'nuclei' },
    });
  });

  it('read handlers are NOT audit-decorated', () => {
    for (const method of ['getManyTools', 'getInstalledTools', 'getToolById']) {
      expect(
        auditConfig(ToolsController.prototype[method as keyof ToolsController]),
      ).toBeUndefined();
    }
  });
});
