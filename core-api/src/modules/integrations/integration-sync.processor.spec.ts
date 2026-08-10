import { NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { IntegrationsService } from './integrations.service';
import type { IntegrationSyncService } from './integrations-sync.service';
import { IntegrationSyncProcessor } from './integration-sync.processor';

/**
 * SC-SCHED-6 + processor delegation tests.
 * The processor only orchestrates: guard → runSync.
 */
describe('IntegrationSyncProcessor', () => {
  let integrationSyncServiceMock: { runSync: jest.Mock };
  let integrationsServiceMock: { getIntegrationById: jest.Mock };
  let processor: IntegrationSyncProcessor;
  let warnSpy: jest.SpyInstance;

  const job = {
    data: { integrationId: 'integration-1', workspaceId: 'ws-1' },
  } as Job<{ integrationId: string; workspaceId: string }>;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    integrationSyncServiceMock = { runSync: jest.fn().mockResolvedValue(undefined) };
    integrationsServiceMock = { getIntegrationById: jest.fn().mockResolvedValue({ id: 'integration-1' }) };

    processor = new IntegrationSyncProcessor(
      integrationSyncServiceMock as unknown as IntegrationSyncService,
      integrationsServiceMock as unknown as IntegrationsService,
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('delegates to runSync with the job payload when the integration exists', async () => {
    await processor.process(job);

    expect(integrationsServiceMock.getIntegrationById).toHaveBeenCalledWith(
      'integration-1',
      'ws-1',
    );
    expect(integrationSyncServiceMock.runSync).toHaveBeenCalledWith(
      'integration-1',
      'ws-1',
    );
  });

  it('SC-SCHED-6: integration deleted before the processor runs → warns and returns, no crash', async () => {
    integrationsServiceMock.getIntegrationById.mockRejectedValue(
      new NotFoundException('Integration not found'),
    );

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('integration-1'),
    );
    expect(integrationSyncServiceMock.runSync).not.toHaveBeenCalled();
  });

  it('rethrows non-not-found errors from the guard', async () => {
    const error = new Error('db down');
    integrationsServiceMock.getIntegrationById.mockRejectedValue(error);

    await expect(processor.process(job)).rejects.toBe(error);
    expect(integrationSyncServiceMock.runSync).not.toHaveBeenCalled();
  });

  it('lets runSync failures fail the job so BullMQ retries (no worker crash)', async () => {
    const error = new Error('Cloudflare API error');
    integrationSyncServiceMock.runSync.mockRejectedValue(error);

    await expect(processor.process(job)).rejects.toBe(error);
  });

  describe('DI metadata (bootstrap regression: UnknownDependenciesException)', () => {
    it('emits real class constructors in design:paramtypes — no import-type erasure', () => {
      const paramTypes = Reflect.getMetadata(
        'design:paramtypes',
        IntegrationSyncProcessor,
      ) as Array<{ name?: string } | undefined>;
      const names = paramTypes.map((t) => t?.name);
      expect(names[0]).toBe('IntegrationSyncService');
      expect(names[1]).toBe('IntegrationsService');
    });
  });
});
