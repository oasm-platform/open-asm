import { NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { IntegrationSyncService } from './integrations-sync.service';
import type { Integration } from './entities/integration.entity';
import type { IntegrationsService } from './integrations.service';
import type { TargetsService } from '@/modules/targets/targets.service';
import type { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import type { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { IntegrationType } from '@/common/enums/enum';

// runConnector is a module import inside IntegrationSyncService — mock it so
// runSync tests never touch the real connector registry / network.
jest.mock('./connectors/connector.factory', () => ({
  runConnector: jest.fn(),
}));
import { runConnector } from './connectors/connector.factory';

const runConnectorMock = runConnector as jest.Mock;

/**
 * Scheduler lifecycle tests (SC-SCHED-1..7) + runSync orchestration.
 * All collaborators are mocked; the queue and repository are plain objects.
 */
describe('IntegrationSyncService', () => {
  let queueMock: { add: jest.Mock; removeJobScheduler: jest.Mock };
  let repoMock: {
    findOneBy: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let integrationsServiceMock: { getIntegrationWithDecryptedConfig: jest.Mock };
  let targetsServiceMock: TargetsService;
  let dataAdapterServiceMock: DataAdapterService;
  let workspacesServiceMock: { getWorkspacesByIds: jest.Mock };
  let service: IntegrationSyncService;

  /** Standard integration row. syncJobId defaults to null (fresh row). */
  const integration = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'integration-1',
      workspaceId: 'ws-1',
      appType: 'cloudflare',
      category: IntegrationType.CLOUD_PROVIDER,
      config: {},
      createdById: 'user-1',
      syncSchedule: '0 0 * * *',
      syncJobId: null,
      lastRunAt: null,
      ...overrides,
    }) as unknown as Integration;

  beforeEach(() => {
    jest.clearAllMocks();
    queueMock = {
      add: jest.fn().mockResolvedValue({ repeatJobKey: 'repeat:integration-1:1' }),
      removeJobScheduler: jest.fn().mockResolvedValue(undefined),
    };
    repoMock = {
      findOneBy: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity: Integration) => entity),
    };
    integrationsServiceMock = {
      getIntegrationWithDecryptedConfig: jest.fn(),
    };
    targetsServiceMock = {} as unknown as TargetsService;
    dataAdapterServiceMock = {} as unknown as DataAdapterService;
    workspacesServiceMock = { getWorkspacesByIds: jest.fn() };

    service = new IntegrationSyncService(
      queueMock as unknown as Queue,
      repoMock as unknown as Repository<Integration>,
      integrationsServiceMock as unknown as IntegrationsService,
      targetsServiceMock,
      dataAdapterServiceMock,
      workspacesServiceMock as unknown as WorkspacesService,
    );
  });

  describe('SC-SCHED-1: addJobScheduler with a cron schedule', () => {
    it('removes any previous scheduler, then adds a repeat job with the cron pattern and persists repeatJobKey', async () => {
      const row = integration({ syncJobId: 'repeat:old:1' });
      repoMock.findOneBy.mockResolvedValue(row);

      const repeatJobKey = await service.addJobScheduler(
        integration({ syncSchedule: '0 0 * * *' }),
      );

      expect(repeatJobKey).toBe('repeat:integration-1:1');
      expect(queueMock.removeJobScheduler).toHaveBeenCalledWith('repeat:old:1');
      expect(queueMock.add).toHaveBeenCalledWith(
        'integration-1', // job name = integration id (BullMQ dedup key)
        { integrationId: 'integration-1', workspaceId: 'ws-1' },
        { repeat: { pattern: '0 0 * * *' } },
      );
      // repeatJobKey persisted into syncJobId
      expect(repoMock.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ syncJobId: 'repeat:integration-1:1' }),
      );
    });

    it('persists null when the job has no repeatJobKey', async () => {
      queueMock.add.mockResolvedValue({ repeatJobKey: null });

      await service.addJobScheduler(integration());

      expect(repoMock.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ syncJobId: null }),
      );
    });
  });

  describe('SC-SCHED-2: disabled schedule never adds a job', () => {
    it('applySchedule(disabled) only removes the existing scheduler and persists the disabled flag', async () => {
      repoMock.findOneBy.mockResolvedValue(
        integration({ syncJobId: 'repeat:old:1' }),
      );

      await service.applySchedule(integration(), 'disabled');

      expect(queueMock.removeJobScheduler).toHaveBeenCalledWith('repeat:old:1');
      expect(queueMock.add).not.toHaveBeenCalled();
      expect(repoMock.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ syncSchedule: 'disabled', syncJobId: null }),
      );
    });
  });

  describe('SC-SCHED-3: switching one cron for another', () => {
    it('removes the old scheduler and adds a job with the new pattern', async () => {
      repoMock.findOneBy.mockResolvedValue(
        integration({ syncSchedule: '0 0 * * *', syncJobId: 'repeat:old:1' }),
      );
      queueMock.add.mockResolvedValue({ repeatJobKey: 'repeat:integration-1:2' });

      await service.applySchedule(
        integration({ syncSchedule: '0 0 * * *' }),
        '0 2 * * *',
      );

      expect(queueMock.removeJobScheduler).toHaveBeenCalledWith('repeat:old:1');
      expect(queueMock.add).toHaveBeenCalledWith(
        'integration-1',
        { integrationId: 'integration-1', workspaceId: 'ws-1' },
        { repeat: { pattern: '0 2 * * *' } },
      );
      expect(repoMock.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          syncSchedule: '0 2 * * *',
          syncJobId: 'repeat:integration-1:2',
        }),
      );
    });
  });

  describe('SC-SCHED-4: disabling a scheduled integration', () => {
    it('removes the scheduler and clears syncJobId to null', async () => {
      repoMock.findOneBy.mockResolvedValue(
        integration({ syncSchedule: '0 0 * * *', syncJobId: 'repeat:old:1' }),
      );

      await service.applySchedule(
        integration({ syncSchedule: '0 0 * * *', syncJobId: 'repeat:old:1' }),
        'disabled',
      );

      expect(queueMock.removeJobScheduler).toHaveBeenCalledWith('repeat:old:1');
      expect(queueMock.add).not.toHaveBeenCalled();
      const saveCalls = repoMock.save.mock.calls;
      const saved = saveCalls[saveCalls.length - 1][0] as Integration;
      expect(saved.syncSchedule).toBe('disabled');
      expect(saved.syncJobId).toBeNull();
    });
  });

  describe('SC-SCHED-5: removeJobScheduler', () => {
    it('removes the queue scheduler by the persisted repeatJobKey and clears syncJobId', async () => {
      repoMock.findOneBy.mockResolvedValue(
        integration({ syncJobId: 'repeat:old:1' }),
      );

      await service.removeJobScheduler('integration-1');

      expect(queueMock.removeJobScheduler).toHaveBeenCalledWith('repeat:old:1');
      const saveCalls = repoMock.save.mock.calls;
      const saved = saveCalls[saveCalls.length - 1][0] as Integration;
      expect(saved.syncJobId).toBeNull();
    });

    it('is a no-op when the integration row no longer exists (delete race)', async () => {
      repoMock.findOneBy.mockResolvedValue(null);

      await expect(service.removeJobScheduler('gone-1')).resolves.toBeUndefined();

      expect(queueMock.removeJobScheduler).not.toHaveBeenCalled();
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('swallows queue errors when the scheduler is already gone', async () => {
      repoMock.findOneBy.mockResolvedValue(
        integration({ syncJobId: 'repeat:old:1' }),
      );
      queueMock.removeJobScheduler.mockRejectedValue(
        new Error('Job scheduler not found'),
      );

      await expect(service.removeJobScheduler('integration-1')).resolves
        .toBeUndefined();
      expect(repoMock.save).toHaveBeenCalled();
    });
  });

  describe('SC-SCHED-7: onModuleInit backfill', () => {
    it('adds a job for every row with a schedule but no syncJobId', async () => {
      repoMock.find.mockResolvedValue([
        integration({ id: 'integration-1' }),
        integration({ id: 'integration-2', syncSchedule: '*/5 * * * *' }),
      ]);

      await service.onModuleInit();

      expect(repoMock.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            syncSchedule: expect.anything(),
            syncJobId: expect.anything(),
          },
        }),
      );
      expect(queueMock.add).toHaveBeenCalledTimes(2);
      expect(queueMock.add).toHaveBeenCalledWith(
        'integration-2',
        { integrationId: 'integration-2', workspaceId: 'ws-1' },
        { repeat: { pattern: '*/5 * * * *' } },
      );
    });

    it('continues when one row fails to schedule (per-row try/catch)', async () => {
      repoMock.find.mockResolvedValue([
        integration({ id: 'integration-1' }),
        integration({ id: 'integration-2' }),
      ]);
      queueMock.add
        .mockRejectedValueOnce(new Error('queue down'))
        .mockResolvedValueOnce({ repeatJobKey: 'repeat:integration-2:1' });

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(queueMock.add).toHaveBeenCalledTimes(2);
      expect(queueMock.add).toHaveBeenLastCalledWith('integration-2', expect.anything(), expect.anything());
    });
  });

  describe('runSync', () => {
    const syncResult = {
      zones: 1,
      records: 2,
      wildcardZones: 0,
      targetsCreated: 1,
      assetsUpserted: 2,
    };

    beforeEach(() => {
      integrationsServiceMock.getIntegrationWithDecryptedConfig.mockResolvedValue({
        integration: integration(),
        decryptedConfig: { apiToken: 'tok' },
      });
      workspacesServiceMock.getWorkspacesByIds.mockResolvedValue([
        { id: 'ws-1', ownerId: 'owner-1' },
      ]);
      runConnectorMock.mockReset();
      runConnectorMock.mockImplementation(
        (_appType: string, _category: string, config: Record<string, unknown>) => {
          // Mirrors CloudflareConnector.syncAssets stashing counts on the config.
          (config as { __syncResult?: unknown }).__syncResult = syncResult;
          return { success: true, message: 'ok', timestamp: new Date().toISOString() };
        },
      );
    });

    it('runs the connector with decrypted config, DI services and workspace-owner acting user', async () => {
      const result = await service.runSync('integration-1', 'ws-1');

      expect(result).toEqual(syncResult);
      expect(runConnectorMock).toHaveBeenCalledWith(
        'cloudflare',
        IntegrationType.CLOUD_PROVIDER,
        expect.objectContaining({
          apiToken: 'tok',
          integrationId: 'integration-1',
          workspaceId: 'ws-1',
          __dryRun: false,
          targetsService: targetsServiceMock,
          dataAdapterService: dataAdapterServiceMock,
          actingUserContext: expect.objectContaining({ id: 'owner-1' }),
        }),
      );
      // Not a dry run → lastRunAt is persisted
      expect(repoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastRunAt: expect.any(Date),
          syncSchedule: '0 0 * * *',
        }),
      );
    });

    it('falls back to the integration creator when the workspace owner cannot be resolved', async () => {
      workspacesServiceMock.getWorkspacesByIds.mockResolvedValue([]);

      await service.runSync('integration-1', 'ws-1');

      expect(runConnectorMock).toHaveBeenCalledWith(
        'cloudflare',
        IntegrationType.CLOUD_PROVIDER,
        expect.objectContaining({
          actingUserContext: expect.objectContaining({ id: 'user-1' }),
        }),
      );
    });

    it('propagates NotFoundException when the integration is missing or in another workspace', async () => {
      integrationsServiceMock.getIntegrationWithDecryptedConfig.mockRejectedValue(
        new NotFoundException('Integration not found'),
      );

      await expect(service.runSync('nope', 'ws-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(runConnectorMock).not.toHaveBeenCalled();
    });

    it('throws when the connector reports failure so the job records the error', async () => {
      runConnectorMock.mockResolvedValue({
        success: false,
        message: 'Connector test failed',
        error: 'boom',
      });

      await expect(service.runSync('integration-1', 'ws-1')).rejects.toThrow(
        'boom',
      );
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('dryRun never writes lastRunAt', async () => {
      await service.runSync('integration-1', 'ws-1', { dryRun: true });

      expect(runConnectorMock).toHaveBeenCalledWith(
        'cloudflare',
        IntegrationType.CLOUD_PROVIDER,
        expect.objectContaining({ __dryRun: true }),
      );
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('returns zero counts when the connector did not stash __syncResult', async () => {
      runConnectorMock.mockImplementation(
        () => ({ success: true, message: 'ok', timestamp: new Date().toISOString() }),
      );

      const result = await service.runSync('integration-1', 'ws-1', {
        dryRun: true,
      });

      expect(result).toEqual({
        zones: 0,
        records: 0,
        wildcardZones: 0,
        targetsCreated: 0,
        assetsUpserted: 0,
      });
    });
  });

  describe('DI metadata (bootstrap regression: UnknownDependenciesException)', () => {
    it('emits real class constructors in design:paramtypes for runtime-imported collaborators — no import-type erasure', () => {
      const paramTypes = Reflect.getMetadata(
        'design:paramtypes',
        IntegrationSyncService,
      ) as Array<{ name?: string } | undefined>;
      const names = paramTypes.map((t) => t?.name);
      // WrapperType<IntegrationsService> resolves to Object under SWC (type
      // aliases are not expanded for decorator metadata); DI correctness for
      // that param comes from the @Inject(forwardRef(...)) token, asserted
      // separately below.
      expect(names[3]).toBe('TargetsService');
      expect(names[4]).toBe('DataAdapterService');
      expect(names[5]).toBe('WorkspacesService');
    });

    it('injects IntegrationsService via a forwardRef token (circular pair)', () => {
      const tokens = Reflect.getMetadata(
        'self:paramtypes',
        IntegrationSyncService,
      ) as Array<{ index: number; param: unknown }> | undefined;
      const entry = tokens?.find((t) => t.index === 2);
      const resolved = (entry?.param as { forwardRef?: () => unknown })
        ?.forwardRef?.();
      expect((resolved as { name?: string } | undefined)?.name).toBe(
        'IntegrationsService',
      );
    });
  });
});
