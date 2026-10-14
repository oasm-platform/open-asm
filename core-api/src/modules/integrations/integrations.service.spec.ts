import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { IntegrationType } from '@/common/enums/enum';
import type { Integration } from './entities/integration.entity';
import { IntegrationsService } from './integrations.service';
import type { IntegrationSyncService } from './integrations-sync.service';

// The service dispatches non-cloud tests through the connector factory.
jest.mock('./connectors/connector.factory', () => ({
  runConnector: jest.fn(),
  testConnectorConnection: jest.fn(),
  resolveSourceCodeConnector: jest.fn(),
}));
import {
  resolveSourceCodeConnector,
  runConnector,
  testConnectorConnection,
} from './connectors/connector.factory';

const runConnectorMock = runConnector as jest.Mock;
const testConnectorConnectionMock = testConnectorConnection as jest.Mock;
const resolveSourceCodeConnectorMock = resolveSourceCodeConnector as jest.Mock;

/**
 * Schedule lifecycle wiring (SC-SCHED-2..5) + sync/test/syncIntegration + DTO mapping.
 */
describe('IntegrationsService', () => {
  let repoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let workspaceEncryptionMock: { getDEK: jest.Mock };
  let integrationSyncServiceMock: {
    applySchedule: jest.Mock;
    removeJobScheduler: jest.Mock;
    runSync: jest.Mock;
    enqueueManualSync: jest.Mock;
  };
  let service: IntegrationsService;

  const syncResult = {
    zones: 1,
    records: 2,
    wildcardZones: 0,
    targetsCreated: 1,
    assetsUpserted: 2,
  };

  const integrationEntity = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'integration-1',
      name: 'Cloudflare',
      description: null,
      appType: 'cloudflare',
      category: IntegrationType.CLOUD_PROVIDER,
      config: {},
      workspaceId: 'ws-1',
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      syncSchedule: '0 0 * * *',
      syncJobId: 'repeat:integration-1:1',
      lastRunAt: new Date(),
      ...overrides,
    }) as unknown as Integration;

  beforeEach(() => {
    jest.clearAllMocks();
    repoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((entity: Integration) => entity),
      save: jest.fn().mockImplementation((entity: Integration) => entity),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    workspaceEncryptionMock = {
      // aes-256-cbc requires a 32-byte DEK
      getDEK: jest
        .fn()
        .mockResolvedValue(Buffer.from('0123456789abcdef0123456789abcdef')),
    };
    integrationSyncServiceMock = {
      applySchedule: jest.fn().mockResolvedValue(undefined),
      removeJobScheduler: jest.fn().mockResolvedValue(undefined),
      runSync: jest.fn().mockResolvedValue(syncResult),
      enqueueManualSync: jest
        .fn()
        .mockResolvedValue({ jobId: 'manual-sync-integration-1' }),
    };

    service = new IntegrationsService(
      repoMock as unknown as Repository<Integration>,
      workspaceEncryptionMock as unknown as WorkspaceEncryptionService,
      integrationSyncServiceMock as unknown as IntegrationSyncService,
    );
  });

  describe('SC-SCHED-1/2: createIntegration schedule wiring', () => {
    const createArgs = {
      name: 'Cloudflare',
      appType: 'cloudflare',
      category: IntegrationType.CLOUD_PROVIDER,
      config: { apiToken: 'tok' },
      workspaceId: 'ws-1',
      userId: 'user-1',
    };

    it('applies the schedule after save when a cron schedule is provided', async () => {
      repoMock.save.mockResolvedValue(integrationEntity());

      const result = await service.createIntegration({
        ...createArgs,
        syncSchedule: '0 0 * * *',
      });

      expect(integrationSyncServiceMock.applySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
        '0 0 * * *',
      );
      // DTO mapping includes the schedule fields
      expect(result.syncSchedule).toBe('0 0 * * *');
      expect(result.lastRunAt).toBeInstanceOf(Date);
    });

    it('does not schedule when syncSchedule is omitted (defaults to disabled)', async () => {
      repoMock.save.mockResolvedValue(
        integrationEntity({ syncSchedule: 'disabled', syncJobId: null }),
      );

      const result = await service.createIntegration(createArgs);

      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
      expect(result.syncSchedule).toBe('disabled');
    });

    it('SC-SCHED-2: does not schedule when syncSchedule is "disabled"', async () => {
      repoMock.save.mockResolvedValue(
        integrationEntity({ syncSchedule: 'disabled', syncJobId: null }),
      );

      await service.createIntegration({ ...createArgs, syncSchedule: 'disabled' });

      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('SC-CREATE-1b: applySchedule failure → saved row removed (best-effort) and the error propagates', async () => {
      repoMock.save.mockResolvedValue(integrationEntity());
      const scheduleError = new Error('queue down');
      integrationSyncServiceMock.applySchedule.mockRejectedValue(scheduleError);

      await expect(
        service.createIntegration({
          ...createArgs,
          syncSchedule: '0 0 * * *',
        }),
      ).rejects.toBe(scheduleError);

      // Best-effort cleanup of the row that could not be scheduled
      expect(repoMock.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
      );
    });
  });

  describe('SC-SCHED-3/4: updateIntegration schedule wiring', () => {
    it('applies the new schedule when dto.syncSchedule is present', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());

      await service.updateIntegration('integration-1', 'ws-1', {
        syncSchedule: '0 2 * * *',
      });

      expect(integrationSyncServiceMock.applySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
        '0 2 * * *',
      );
    });

    it('SC-SCHED-4: applying "disabled" removes the scheduler', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());

      await service.updateIntegration('integration-1', 'ws-1', {
        syncSchedule: 'disabled',
      });

      expect(integrationSyncServiceMock.applySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
        'disabled',
      );
    });

    it('does not touch the scheduler when dto.syncSchedule is absent', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());

      await service.updateIntegration('integration-1', 'ws-1', {
        name: 'Renamed',
      });

      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException when the integration is missing', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateIntegration('nope', 'ws-1', { syncSchedule: 'disabled' }),
      ).rejects.toThrow(NotFoundException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });
  });

  describe('F3: syncSchedule is only accepted for cloud-provider integrations', () => {
    const notificationArgs = {
      name: 'Slack',
      appType: 'slack',
      category: IntegrationType.NOTIFICATION,
      config: { webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXX' },
      workspaceId: 'ws-1',
      userId: 'user-1',
    };

    it('rejects a cron syncSchedule on create for a NOTIFICATION integration', async () => {
      repoMock.save.mockResolvedValue(integrationEntity());

      await expect(
        service.createIntegration({
          ...notificationArgs,
          syncSchedule: '0 0 * * *',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('accepts "disabled" syncSchedule on create for any category', async () => {
      repoMock.save.mockResolvedValue(
        integrationEntity({
          category: IntegrationType.NOTIFICATION,
          syncSchedule: 'disabled',
          syncJobId: null,
        }),
      );

      const result = await service.createIntegration({
        ...notificationArgs,
        syncSchedule: 'disabled',
      });

      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
      expect(result.syncSchedule).toBe('disabled');
    });

    it('rejects a cron syncSchedule on update for a NOTIFICATION integration', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({ category: IntegrationType.NOTIFICATION }),
      );

      await expect(
        service.updateIntegration('integration-1', 'ws-1', {
          syncSchedule: '0 0 * * *',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });
  });

  describe('AWS workloadIdentity rejects scheduled syncs', () => {
    const workloadIdentityConfig = {
      connectionMethod: 'workloadIdentity',
      region: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789012:role/oasm',
      webIdentityToken: 'oidc-token',
    };
    const awsCreateArgs = {
      name: 'AWS',
      appType: 'aws',
      category: IntegrationType.CLOUD_PROVIDER,
      config: workloadIdentityConfig,
      workspaceId: 'ws-1',
      userId: 'user-1',
    };

    it('rejects a cron syncSchedule on create', async () => {
      repoMock.save.mockResolvedValue(integrationEntity({ appType: 'aws' }));

      await expect(
        service.createIntegration({
          ...awsCreateArgs,
          syncSchedule: '0 0 * * *',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('accepts "disabled" syncSchedule on create', async () => {
      repoMock.save.mockResolvedValue(
        integrationEntity({ appType: 'aws', syncSchedule: 'disabled' }),
      );

      const result = await service.createIntegration({
        ...awsCreateArgs,
        syncSchedule: 'disabled',
      });

      expect(result.syncSchedule).toBe('disabled');
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('allows a cron syncSchedule on create for a non-workloadIdentity AWS method', async () => {
      repoMock.save.mockResolvedValue(integrationEntity({ appType: 'aws' }));

      const result = await service.createIntegration({
        ...awsCreateArgs,
        config: {
          connectionMethod: 'accessKey',
          region: 'us-east-1',
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
        },
        syncSchedule: '0 0 * * *',
      });

      expect(result.syncSchedule).toBe('0 0 * * *');
      expect(integrationSyncServiceMock.applySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
        '0 0 * * *',
      );
    });

    it('rejects a cron syncSchedule on update using the stored config when dto.config is absent', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({
          appType: 'aws',
          config: { connectionMethod: 'workloadIdentity' },
        }),
      );

      await expect(
        service.updateIntegration('integration-1', 'ws-1', {
          syncSchedule: '0 2 * * *',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('rejects a cron syncSchedule on update when dto.config sets workloadIdentity', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({ appType: 'aws', config: {} }),
      );

      await expect(
        service.updateIntegration('integration-1', 'ws-1', {
          config: workloadIdentityConfig,
          syncSchedule: '0 2 * * *',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
    });

    it('allows "disabled" syncSchedule on update for workloadIdentity', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({
          appType: 'aws',
          config: { connectionMethod: 'workloadIdentity' },
        }),
      );

      await service.updateIntegration('integration-1', 'ws-1', {
        syncSchedule: 'disabled',
      });

      expect(integrationSyncServiceMock.applySchedule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
        'disabled',
      );
    });

    it('rejects a config-only update that switches a scheduled integration to workloadIdentity (syncSchedule omitted)', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({
          appType: 'aws',
          syncSchedule: '0 0 * * *',
          config: { connectionMethod: 'accessKey' },
        }),
      );

      await expect(
        service.updateIntegration('integration-1', 'ws-1', {
          config: workloadIdentityConfig,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.applySchedule).not.toHaveBeenCalled();
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('allows a config-only workloadIdentity update when the integration has no active schedule', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({
          appType: 'aws',
          syncSchedule: 'disabled',
          config: { connectionMethod: 'accessKey' },
        }),
      );

      await expect(
        service.updateIntegration('integration-1', 'ws-1', {
          config: workloadIdentityConfig,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('SC-SCHED-5: deleteIntegration removes the scheduler first', () => {
    it('calls removeJobScheduler before deleting the row', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());

      await service.deleteIntegration('integration-1', 'ws-1');

      expect(integrationSyncServiceMock.removeJobScheduler).toHaveBeenCalledWith(
        'integration-1',
      );
      expect(repoMock.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'integration-1' }),
      );
    });

    it('propagates NotFoundException for missing integrations', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(
        service.deleteIntegration('nope', 'ws-1'),
      ).rejects.toThrow(NotFoundException);
      expect(integrationSyncServiceMock.removeJobScheduler).not.toHaveBeenCalled();
    });
  });

  describe('SC-API-3: testIntegration for cloud providers runs a dry-run sync', () => {
    it('calls runSync with dryRun: true and never touches lastRunAt', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());

      const result = await service.testIntegration('integration-1', 'ws-1');

      expect(integrationSyncServiceMock.runSync).toHaveBeenCalledWith(
        'integration-1',
        'ws-1',
        { dryRun: true },
      );
      expect(runConnectorMock).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('cloudflare sync OK (dry run)');
      expect(result.message).toContain(JSON.stringify(syncResult));
    });

    it('SC-TEST-2b: cloud dry-run failure → success:false result with the error surfaced, no throw', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());
      integrationSyncServiceMock.runSync.mockRejectedValue(
        new BadRequestException('boom'),
      );

      const result = await service.testIntegration('integration-1', 'ws-1');

      expect(result.success).toBe(false);
      expect(result.category).toBe(IntegrationType.CLOUD_PROVIDER);
      expect(result.appType).toBe('cloudflare');
      expect(result.message).toBe('Connector test failed');
      expect(result.error).toBe('boom');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('SC-API-4: testIntegration for non-cloud categories keeps the factory path', () => {
    it('dispatches through runConnector when the category is NOTIFICATION', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({
          appType: 'slack',
          category: IntegrationType.NOTIFICATION,
        }),
      );
      runConnectorMock.mockResolvedValue({
        success: true,
        message: 'slack.push() completed successfully',
        timestamp: new Date().toISOString(),
      });

      const result = await service.testIntegration('integration-1', 'ws-1');

      expect(integrationSyncServiceMock.runSync).not.toHaveBeenCalled();
      expect(runConnectorMock).toHaveBeenCalledWith(
        'slack',
        IntegrationType.NOTIFICATION,
        expect.objectContaining({ text: expect.any(String) }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('syncIntegration (enqueue-and-return)', () => {
    it('SC-API-1: verifies ownership then enqueues a manual sync — runSync is NOT called', async () => {
      repoMock.findOne.mockResolvedValue(integrationEntity());

      const result = await service.syncIntegration('integration-1', 'ws-1');

      expect(integrationSyncServiceMock.enqueueManualSync).toHaveBeenCalledWith(
        'integration-1',
        'ws-1',
      );
      expect(integrationSyncServiceMock.runSync).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'manual-sync-integration-1' });
    });

    it('SC-API-1b: rejects non-cloud integrations before enqueueing', async () => {
      repoMock.findOne.mockResolvedValue(
        integrationEntity({ category: IntegrationType.NOTIFICATION }),
      );

      await expect(
        service.syncIntegration('integration-1', 'ws-1'),
      ).rejects.toThrow(BadRequestException);
      expect(integrationSyncServiceMock.enqueueManualSync).not.toHaveBeenCalled();
    });

    it('SC-API-2: propagates 404 when the integration is not in the workspace', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(
        service.syncIntegration('nope', 'ws-1'),
      ).rejects.toThrow(NotFoundException);
      expect(integrationSyncServiceMock.enqueueManualSync).not.toHaveBeenCalled();
    });
  });

  describe('capabilities', () => {
    const githubArgs = {
      name: 'GitHub',
      appType: 'github',
      category: IntegrationType.SOURCE_CODE,
      config: { apiToken: 'ghp_x' },
      workspaceId: 'ws-1',
      userId: 'user-1',
    };

    const githubEntity = (overrides: Record<string, unknown> = {}) =>
      integrationEntity({
        appType: 'github',
        category: IntegrationType.SOURCE_CODE,
        capabilities: [IntegrationType.SOURCE_CODE],
        config: { apiToken: 'ghp_x' },
        syncSchedule: 'disabled',
        syncJobId: null,
        ...overrides,
      });

    describe('legacy single-capability apps are unchanged', () => {
      it('stores [category] when capabilities are omitted', async () => {
        runConnectorMock.mockResolvedValue({ success: true });

        await service.createIntegration({
          name: 'Webhook',
          appType: 'webhook',
          category: IntegrationType.NOTIFICATION,
          config: { url: 'https://hooks.example.com/x' },
          workspaceId: 'ws-1',
          userId: 'user-1',
        });

        expect(repoMock.create).toHaveBeenCalledWith(
          expect.objectContaining({
            category: IntegrationType.NOTIFICATION,
            capabilities: [IntegrationType.NOTIFICATION],
          }),
        );
      });

      it('rejects a capability the legacy app does not have', async () => {
        await expect(
          service.createIntegration({
            name: 'Cloudflare',
            appType: 'cloudflare',
            category: IntegrationType.CLOUD_PROVIDER,
            capabilities: [IntegrationType.TICKETING],
            config: { apiToken: 'tok' },
            workspaceId: 'ws-1',
            userId: 'user-1',
          }),
        ).rejects.toThrow(BadRequestException);
        expect(repoMock.save).not.toHaveBeenCalled();
      });

      it('reports [category] for a pre-migration row with an empty array', async () => {
        repoMock.findOne.mockResolvedValue(
          integrationEntity({ capabilities: [] }),
        );

        const result = await service.getIntegrationById('integration-1', 'ws-1');

        expect(result.capabilities).toEqual([IntegrationType.CLOUD_PROVIDER]);
      });
    });

    describe('multi-capability apps (GitHub)', () => {
      it('stores the enabled subset and keeps the primary category inside it', async () => {
        await service.createIntegration({
          ...githubArgs,
          category: IntegrationType.NOTIFICATION, // not supported → replaced
          capabilities: [IntegrationType.TICKETING, IntegrationType.SOURCE_CODE],
          config: { apiToken: 'ghp_x', ticketRepository: 'acme/sec' },
        });

        expect(repoMock.create).toHaveBeenCalledWith(
          expect.objectContaining({
            category: IntegrationType.TICKETING,
            capabilities: [IntegrationType.TICKETING, IntegrationType.SOURCE_CODE],
          }),
        );
      });

      it('rejects a capability GitHub does not declare', async () => {
        await expect(
          service.createIntegration({
            ...githubArgs,
            capabilities: [IntegrationType.NOTIFICATION],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('requires capability-scoped fields only while that capability is enabled', async () => {
        await expect(
          service.createIntegration({
            ...githubArgs,
            capabilities: [IntegrationType.TICKETING],
          }),
        ).rejects.toThrow(/ticketRepository/);

        await expect(
          service.createIntegration({
            ...githubArgs,
            capabilities: [IntegrationType.SOURCE_CODE],
          }),
        ).resolves.toBeDefined();
      });

      it('never persists injected discriminators inside config', async () => {
        await service.createIntegration({
          ...githubArgs,
          config: { apiToken: 'ghp_x', capabilities: ['SOURCE_CODE'] },
        });

        const created = repoMock.create.mock.calls[0][0] as Integration;
        expect(created.config).not.toHaveProperty('capabilities');
      });

      it('does not send a connected message (no NOTIFICATION capability)', async () => {
        await service.createIntegration(githubArgs);
        expect(runConnectorMock).not.toHaveBeenCalled();
      });

      it('re-validates the stored config when a capability is enabled on update', async () => {
        repoMock.findOne.mockResolvedValue(githubEntity());

        await expect(
          service.updateIntegration('integration-1', 'ws-1', {
            capabilities: [IntegrationType.SOURCE_CODE, IntegrationType.TICKETING],
          }),
        ).rejects.toThrow(/ticketRepository/);
      });

      it('tests the bare connection when no capability is given', async () => {
        repoMock.findOne.mockResolvedValue(githubEntity());
        testConnectorConnectionMock.mockResolvedValue({ success: true });

        await service.testIntegration('integration-1', 'ws-1', {});

        expect(testConnectorConnectionMock).toHaveBeenCalledWith(
          'github',
          undefined,
          expect.objectContaining({ apiToken: 'ghp_x' }),
        );
        expect(runConnectorMock).not.toHaveBeenCalled();
      });

      it('rejects testing a capability that is not enabled', async () => {
        repoMock.findOne.mockResolvedValue(githubEntity());

        await expect(
          service.testIntegration('integration-1', 'ws-1', {
            capability: IntegrationType.TICKETING,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('lists repositories through the SOURCE_CODE connector', async () => {
        repoMock.findOne.mockResolvedValue(githubEntity());
        const page = { data: [], page: 1, limit: 30, hasNextPage: false };
        const listRepositories = jest.fn().mockResolvedValue(page);
        resolveSourceCodeConnectorMock.mockReturnValue({ listRepositories });

        const result = await service.listRepositories('integration-1', 'ws-1', {
          page: 1,
          limit: 30,
          search: 'web',
        });

        expect(result).toBe(page);
        expect(listRepositories).toHaveBeenCalledWith(
          expect.objectContaining({ apiToken: 'ghp_x' }),
          { search: 'web', page: 1, limit: 30 },
        );
      });

      it('refuses to list repositories without the SOURCE_CODE capability', async () => {
        repoMock.findOne.mockResolvedValue(
          githubEntity({
            category: IntegrationType.TICKETING,
            capabilities: [IntegrationType.TICKETING],
          }),
        );

        await expect(
          service.listRepositories('integration-1', 'ws-1', { page: 1, limit: 30 }),
        ).rejects.toThrow(BadRequestException);
        expect(resolveSourceCodeConnectorMock).not.toHaveBeenCalled();
      });
    });
  });
});
