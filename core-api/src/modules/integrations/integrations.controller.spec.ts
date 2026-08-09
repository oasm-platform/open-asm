import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { IntegrationsController } from './integrations.controller';

describe('IntegrationsController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getSchemas', 'GET /schemas', ['integration.read']],
    ['createIntegration', 'POST /', ['integration.write']],
    ['getManyIntegrations', 'GET /', ['integration.read']],
    ['getIntegrationById', 'GET /:id', ['integration.read']],
    ['updateIntegration', 'PATCH /:id', ['integration.write']],
    ['deleteIntegration', 'DELETE /:id', ['integration.write']],
    ['testIntegration', 'POST /:id/test', ['integration.write']],
    [
      'createTelegramPairing',
      'POST /:id/telegram/pairing',
      ['integration.write'],
    ],
    ['getTelegramConnects', 'GET /:id/telegram/connects', ['integration.read']],
    [
      'disconnectTelegramConnect',
      'DELETE /:id/telegram/connects/:connectId',
      ['integration.write'],
    ],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (
      IntegrationsController.prototype as Record<
        string,
        (...args: unknown[]) => unknown
      >
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      IntegrationsController,
    ]);
    expect(required).toEqual(keys);
  });

  it('should leave the public telegram webhook unguarded', () => {
    const handler = (
      IntegrationsController.prototype as Record<
        string,
        (...args: unknown[]) => unknown
      >
    ).telegramWebhook as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      IntegrationsController,
    ]);
    expect(required).toBeUndefined();
  });
});
