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
}));
import { runConnector } from './connectors/connector.factory';

const runConnectorMock = runConnector as jest.Mock;

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
});
