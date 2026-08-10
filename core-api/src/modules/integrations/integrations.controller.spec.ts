import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntegrationType } from '@/common/enums/enum';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { IntegrationsController } from './integrations.controller';
import type { IntegrationsService } from './integrations.service';
import type { TelegramConnectService } from './telegram-connect.service';
import type { TelegramWebhookService } from './telegram-webhook.service';

/**
 * API contract tests (SC-API-1..4) — controller mapping only, service mocked.
 */
describe('IntegrationsController', () => {
  let integrationsServiceMock: {
    syncIntegration: jest.Mock;
    testIntegration: jest.Mock;
    createIntegration: jest.Mock;
  };
  let controller: IntegrationsController;

  const syncResult = {
    zones: 1,
    records: 2,
    wildcardZones: 0,
    targetsCreated: 1,
    assetsUpserted: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    integrationsServiceMock = {
      syncIntegration: jest.fn().mockResolvedValue(syncResult),
      testIntegration: jest.fn(),
      createIntegration: jest.fn().mockResolvedValue({ id: 'integration-1' }),
    };

    controller = new IntegrationsController(
      integrationsServiceMock as unknown as IntegrationsService,
      {} as unknown as TelegramConnectService,
      {} as unknown as TelegramWebhookService,
    );
  });

  it('SC-API-1: POST :id/sync returns success with counts', async () => {
    const response = await controller.syncIntegration(
      { id: 'integration-1' },
      'ws-1',
    );

    expect(integrationsServiceMock.syncIntegration).toHaveBeenCalledWith(
      'integration-1',
      'ws-1',
    );
    expect(response).toEqual({
      success: true,
      message: 'Sync completed',
      counts: syncResult,
    });
  });

  it('SC-API-2: POST :id/sync propagates 404 for unknown/foreign integrations', async () => {
    integrationsServiceMock.syncIntegration.mockRejectedValue(
      new NotFoundException('Integration not found'),
    );

    await expect(
      controller.syncIntegration({ id: 'nope' }, 'ws-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('SC-API-3: POST :id/test with a cloud provider returns success from the dry run', async () => {
    integrationsServiceMock.testIntegration.mockResolvedValue({
      success: true,
      category: IntegrationType.CLOUD_PROVIDER,
      appType: 'cloudflare',
      message: 'Cloudflare sync OK (dry run): {"zones":1}',
      timestamp: new Date().toISOString(),
    });

    const response = await controller.testIntegration(
      { id: 'integration-1' },
      {},
      'ws-1',
    );

    expect(integrationsServiceMock.testIntegration).toHaveBeenCalledWith(
      'integration-1',
      'ws-1',
      {},
    );
    expect(response.success).toBe(true);
    expect(response.message).toContain('dry run');
  });

  it('SC-API-4: POST :id/test with an unregistered appType reports success:false', async () => {
    integrationsServiceMock.testIntegration.mockResolvedValue({
      success: false,
      category: IntegrationType.CLOUD_PROVIDER,
      appType: 'aws',
      message: 'No connector registered for appType "aws"',
      timestamp: new Date().toISOString(),
    });

    const response = await controller.testIntegration(
      { id: 'integration-2' },
      {},
      'ws-1',
    );

    expect(response.success).toBe(false);
    expect(response.message).toContain('No connector registered');
  });

  it('threads syncSchedule from the DTO into createIntegration', async () => {
    await controller.createIntegration(
      {
        name: 'Cloudflare',
        appType: 'cloudflare',
        category: IntegrationType.CLOUD_PROVIDER,
        config: { apiToken: 'tok' },
        syncSchedule: '0 0 * * *',
      },
      'ws-1',
      'user-1',
    );

    expect(integrationsServiceMock.createIntegration).toHaveBeenCalledWith({
      name: 'Cloudflare',
      description: undefined,
      appType: 'cloudflare',
      category: IntegrationType.CLOUD_PROVIDER,
      config: { apiToken: 'tok' },
      syncSchedule: '0 0 * * *',
      workspaceId: 'ws-1',
      userId: 'user-1',
    });
  });
});

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
    ['syncIntegration', 'POST /:id/sync', ['integration.write']],
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
