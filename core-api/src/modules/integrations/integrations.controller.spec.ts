import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntegrationType } from '@/common/enums/enum';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { IntegrationsController } from './integrations.controller';
import type { IntegrationsService } from './integrations.service';
import type { TelegramConnectService } from './telegram-connect.service';
import type { TelegramWebhookService } from './telegram-webhook.service';
import type { AwsSsoService } from './connectors/aws/aws-sso.service';

/**
 * API contract tests (SC-API-1..4) — controller mapping only, service mocked.
 */
describe('IntegrationsController', () => {
  let integrationsServiceMock: {
    syncIntegration: jest.Mock;
    testIntegration: jest.Mock;
    createIntegration: jest.Mock;
  };
  let awsSsoServiceMock: {
    startDeviceAuth: jest.Mock;
    pollDeviceAuth: jest.Mock;
    listSsoAccounts: jest.Mock;
    listSsoRoles: jest.Mock;
  };
  let controller: IntegrationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    integrationsServiceMock = {
      syncIntegration: jest
        .fn()
        .mockResolvedValue({ jobId: 'manual-sync-integration-1' }),
      testIntegration: jest.fn(),
      createIntegration: jest.fn().mockResolvedValue({ id: 'integration-1' }),
    };
    awsSsoServiceMock = {
      startDeviceAuth: jest.fn(),
      pollDeviceAuth: jest.fn(),
      listSsoAccounts: jest.fn(),
      listSsoRoles: jest.fn(),
    };

    controller = new IntegrationsController(
      integrationsServiceMock as unknown as IntegrationsService,
      {} as unknown as TelegramConnectService,
      {} as unknown as TelegramWebhookService,
      awsSsoServiceMock as unknown as AwsSsoService,
    );
  });

  it('SC-API-1: POST :id/sync enqueues and returns the queued response with jobId', async () => {
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
      message: 'Sync queued',
      jobId: 'manual-sync-integration-1',
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
      appType: 'unregistered-app',
      message: 'No connector registered for appType "unregistered-app"',
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

  describe('AWS SSO connect endpoints', () => {
    it('device maps the DTO into startDeviceAuth and returns the payload', async () => {
      awsSsoServiceMock.startDeviceAuth.mockResolvedValue({
        clientId: 'c1',
        clientSecret: 's1',
        deviceCode: 'd1',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://device.example/',
        interval: 5,
        expiresIn: 600,
      });

      const response = await controller.startAwsSsoDevice({
        region: 'us-east-1',
        startUrl: 'https://acme.awsapps.com/start',
      });

      expect(awsSsoServiceMock.startDeviceAuth).toHaveBeenCalledWith({
        region: 'us-east-1',
        startUrl: 'https://acme.awsapps.com/start',
      });
      expect(response.clientId).toBe('c1');
      expect(response.deviceCode).toBe('d1');
      expect(integrationsServiceMock.createIntegration).not.toHaveBeenCalled();
    });

    it('poll pending returns pending and creates no integration', async () => {
      awsSsoServiceMock.pollDeviceAuth.mockResolvedValue({ status: 'pending' });

      const response = await controller.pollAwsSsoDevice({
        region: 'us-east-1',
        clientId: 'c1',
        clientSecret: 's1',
        deviceCode: 'd1',
      });

      expect(response).toEqual({ status: 'pending' });
      expect(awsSsoServiceMock.listSsoAccounts).not.toHaveBeenCalled();
      expect(integrationsServiceMock.createIntegration).not.toHaveBeenCalled();
    });

    it('poll slow_down returns slow_down without listing accounts', async () => {
      awsSsoServiceMock.pollDeviceAuth.mockResolvedValue({
        status: 'slow_down',
      });

      const response = await controller.pollAwsSsoDevice({
        region: 'us-east-1',
        clientId: 'c1',
        clientSecret: 's1',
        deviceCode: 'd1',
      });

      expect(response).toEqual({ status: 'slow_down' });
      expect(awsSsoServiceMock.listSsoAccounts).not.toHaveBeenCalled();
    });

    it('poll authorized returns the refresh token plus accounts with roles', async () => {
      awsSsoServiceMock.pollDeviceAuth.mockResolvedValue({
        status: 'authorized',
        accessToken: 'at-1',
        refreshToken: 'rt-1',
      });
      awsSsoServiceMock.listSsoAccounts.mockResolvedValue([
        { accountId: '111', accountName: 'Prod' },
        { accountId: '222', accountName: 'Dev' },
      ]);
      awsSsoServiceMock.listSsoRoles
        .mockResolvedValueOnce([
          { roleName: 'Admin' },
          { roleName: 'ReadOnly' },
        ])
        .mockResolvedValueOnce([{ roleName: 'Dev' }]);

      const response = await controller.pollAwsSsoDevice({
        region: 'us-east-1',
        clientId: 'c1',
        clientSecret: 's1',
        deviceCode: 'd1',
      });

      expect(response).toEqual({
        status: 'authorized',
        refreshToken: 'rt-1',
        accounts: [
          { accountId: '111', accountName: 'Prod', roles: ['Admin', 'ReadOnly'] },
          { accountId: '222', accountName: 'Dev', roles: ['Dev'] },
        ],
      });
      expect(awsSsoServiceMock.listSsoRoles).toHaveBeenCalledWith({
        region: 'us-east-1',
        accessToken: 'at-1',
        accountId: '111',
      });
      expect(awsSsoServiceMock.listSsoRoles).toHaveBeenCalledWith({
        region: 'us-east-1',
        accessToken: 'at-1',
        accountId: '222',
      });
      expect(integrationsServiceMock.createIntegration).not.toHaveBeenCalled();
    });

    it('complete maps the DTO to createIntegration as aws/CLOUD_PROVIDER and returns the masked config', async () => {
      integrationsServiceMock.createIntegration.mockResolvedValue({
        id: 'integration-9',
        appType: 'aws',
        category: IntegrationType.CLOUD_PROVIDER,
        config: {
          connectionMethod: 'sso',
          region: 'us-east-1',
          accountId: '111',
          roleName: 'Admin',
          clientId: 'c1',
          clientSecret: '****cret',
          refreshToken: '****oken',
        },
      });

      const response = await controller.completeAwsSso({
        name: 'AWS SSO',
        region: 'us-east-1',
        startUrl: 'https://acme.awsapps.com/start',
        accountId: '111',
        roleName: 'Admin',
        clientId: 'c1',
        clientSecret: 's1',
        refreshToken: 'rt-1',
      }, 'ws-1', 'user-1');

      expect(integrationsServiceMock.createIntegration).toHaveBeenCalledWith({
        name: 'AWS SSO',
        description: undefined,
        appType: 'aws',
        category: IntegrationType.CLOUD_PROVIDER,
        config: {
          connectionMethod: 'sso',
          region: 'us-east-1',
          startUrl: 'https://acme.awsapps.com/start',
          accountId: '111',
          roleName: 'Admin',
          clientId: 'c1',
          clientSecret: 's1',
          refreshToken: 'rt-1',
        },
        workspaceId: 'ws-1',
        userId: 'user-1',
        syncSchedule: undefined,
      });
      expect(response.config.clientSecret).toBe('****cret');
      expect(response.config.refreshToken).toBe('****oken');
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
    ['startAwsSsoDevice', 'POST /aws/sso/device', ['integration.write']],
    ['pollAwsSsoDevice', 'POST /aws/sso/poll', ['integration.write']],
    ['completeAwsSso', 'POST /aws/sso/complete', ['integration.write']],
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
      IntegrationsController.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >
    )[method];
    const required = reflector.getAllAndOverride<string[]>(WorkspacePermissions, [
      handler,
      IntegrationsController,
    ]);
    expect(required).toEqual(keys);
  });

  it('should leave the public telegram webhook unguarded', () => {
    const handler = (
      IntegrationsController.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >
    ).telegramWebhook;
    const required = reflector.getAllAndOverride<string[]>(WorkspacePermissions, [
      handler,
      IntegrationsController,
    ]);
    expect(required).toBeUndefined();
  });
});
