import { RedisLockService } from '@/services/redis/distributed-lock.service';
import type { DataSource } from 'typeorm';
import type { ConnectorRegistryService } from '../connectors/connector-registry.service';
import type { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { JobConfigSealService } from './job-config-seal.service';

describe('JobConfigSealService', () => {
  const query = jest.fn();
  const sealJobConfig = jest.fn();
  const connectors = [
    { slug: 'nessus', configSchema: { properties: { apiKey: {} } } },
    { slug: 'nuclei', configSchema: { properties: { rateLimit: {} } } },
  ];
  let service: JobConfigSealService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(RedisLockService, 'current', 'get').mockReturnValue({
      withLock: (_key: string, _ttl: number, action: () => Promise<unknown>) =>
        action(),
    } as unknown as RedisLockService);
    service = new JobConfigSealService(
      { query } as unknown as DataSource,
      { getAllConnectors: () => connectors } as unknown as ConnectorRegistryService,
      { sealJobConfig } as unknown as ToolConfigProfilesService,
    );
  });

  it('seals the stored configs of connectors that have secrets, once per row', async () => {
    const plain = { apiKey: 'plain' };
    const sealed = { apiKey: 'v2:dek:x' };
    query
      .mockResolvedValueOnce([
        { id: 'j1', config: plain, tool: 'nessus', workspaceId: 'ws-1' },
        { id: 'j2', config: sealed, tool: 'nessus', workspaceId: 'ws-1' },
      ])
      .mockResolvedValueOnce([[], 1]);
    sealJobConfig.mockImplementation((_ws: string, _tool: string, config: unknown) =>
      Promise.resolve(config === plain ? sealed : config),
    );

    expect(await service.sealStoredConfigs()).toBe(1);

    // Only connectors whose schema has a sensitive field are scanned.
    expect(query.mock.calls[0][1][0]).toEqual(['nessus']);
    // j2 was already sealed: one UPDATE, guarded on the value it read.
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual([
      JSON.stringify(sealed),
      'j1',
      JSON.stringify(plain),
    ]);
  });

  it('pages through the jobs after the last id it read', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({ id: `j${i}`, config: {} }));
    query.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
    sealJobConfig.mockImplementation((_ws: string, _tool: string, config: unknown) =>
      Promise.resolve(config),
    );

    await service.sealStoredConfigs();

    expect(query.mock.calls[1][1][1]).toBe('j499');
  });

  it('does nothing when no connector declares a secret', async () => {
    service = new JobConfigSealService(
      { query } as unknown as DataSource,
      { getAllConnectors: () => [connectors[1]] } as unknown as ConnectorRegistryService,
      { sealJobConfig } as unknown as ToolConfigProfilesService,
    );

    expect(await service.sealStoredConfigs()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
