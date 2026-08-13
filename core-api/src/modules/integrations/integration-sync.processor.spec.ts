import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { IntegrationSyncService } from './integrations-sync.service';
import { IntegrationSyncProcessor } from './integration-sync.processor';

/**
 * SC-SCHED-6 + processor delegation tests.
 * The processor only orchestrates: guard → runSync.
 */
describe('IntegrationSyncProcessor', () => {
  let integrationSyncServiceMock: {
    runSync: jest.Mock;
    integrationExists: jest.Mock;
  };
  let processor: IntegrationSyncProcessor;
  let warnSpy: jest.SpyInstance;

  const job = {
    data: { integrationId: 'integration-1', workspaceId: 'ws-1' },
  } as Job<{ integrationId: string; workspaceId: string }>;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    integrationSyncServiceMock = {
      runSync: jest.fn().mockResolvedValue(undefined),
      integrationExists: jest.fn().mockResolvedValue(true),
    };

    processor = new IntegrationSyncProcessor(
      integrationSyncServiceMock as unknown as IntegrationSyncService,
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('SC-ORPHAN-2: delegates to runSync with the job payload when the integration exists', async () => {
    await processor.process(job);

    expect(integrationSyncServiceMock.integrationExists).toHaveBeenCalledWith(
      'integration-1',
      'ws-1',
    );
    expect(integrationSyncServiceMock.runSync).toHaveBeenCalledWith(
      'integration-1',
      'ws-1',
    );
  });

  it('SC-ORPHAN-1: integration deleted before the processor runs → warns and returns, no runSync', async () => {
    integrationSyncServiceMock.integrationExists.mockResolvedValue(false);

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('integration-1'),
    );
    expect(integrationSyncServiceMock.runSync).not.toHaveBeenCalled();
  });

  it('rethrows guard errors (e.g. DB down) instead of swallowing them', async () => {
    const error = new Error('db down');
    integrationSyncServiceMock.integrationExists.mockRejectedValue(error);

    await expect(processor.process(job)).rejects.toBe(error);
    expect(integrationSyncServiceMock.runSync).not.toHaveBeenCalled();
  });

  it('lets runSync failures fail the job so BullMQ retries (no worker crash)', async () => {
    const error = new Error('Cloudflare API error');
    integrationSyncServiceMock.runSync.mockRejectedValue(error);

    await expect(processor.process(job)).rejects.toBe(error);
  });

  describe('DI metadata (bootstrap regression: UnknownDependenciesException)', () => {
    it('emits the real class constructor in design:paramtypes — no import-type erasure', () => {
      const paramTypes = Reflect.getMetadata(
        'design:paramtypes',
        IntegrationSyncProcessor,
      ) as Array<{ name?: string } | undefined>;
      const names = paramTypes.map((t) => t?.name);
      expect(names).toHaveLength(1);
      expect(names[0]).toBe('IntegrationSyncService');
    });
  });
});
