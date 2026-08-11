import { BadRequestException } from '@nestjs/common';
import { CloudflareConnector } from './cloudflare.connector';
import { TargetSource } from '../../targets/entities/target.entity';

/**
 * Ingestion algorithm tests (SC-ING-1..5).
 * Services are plain objects with jest.fn; fetch is mocked.
 */

const ZONE = { id: 'zone-1', name: 'example.com', status: 'active' };

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const record = (type: string, name: string, content: string) => ({
  id: `${type}-${name}-${content}`,
  type,
  name,
  content,
});

function pageWith(result: unknown[], page = 1, totalPages = 1): unknown {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    result_info: {
      count: result.length,
      page,
      per_page: 5000,
      total_count: result.length,
      total_pages: totalPages,
    },
  };
}

function zonePageWith(result: unknown[], page = 1, totalPages = 1): unknown {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    result_info: {
      count: result.length,
      page,
      per_page: 50,
      total_count: result.length,
      total_pages: totalPages,
    },
  };
}

describe('CloudflareConnector ingestion', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      mockResponse({ success: true, errors: [], result: [], result_info: null }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Standard fixture: one zone `example.com` with apex + one subdomain record. */
  function stubStandardFetch(): void {
    mockFetch
      .mockResolvedValueOnce(mockResponse(zonePageWith([ZONE], 1, 1)))
      .mockResolvedValueOnce(
        mockResponse(
          pageWith([
            record('A', 'example.com', '192.0.2.1'),
            record('A', 'www.example.com', '192.0.2.2'),
          ]),
        ),
      );
  }

  function makeServices(overrides: Record<string, unknown> = {}) {
    return {
      targetsService: {
        findByWorkspaceAndValues: jest.fn(),
        createMultipleTargets: jest.fn(),
      },
      dataAdapterService: {
        upsertAssetsByTargetId: jest.fn().mockResolvedValue(2),
      },
      actingUserContext: { id: 'user-1', userId: 'user-1' },
      ...overrides,
    };
  }

  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      apiToken: 'test-token',
      workspaceId: 'ws-1',
      integrationId: 'integration-1',
      ...makeServices(),
      ...overrides,
    };
  }

  it('SC-ING-1: target missing → createMultipleTargets called once, upsert under new target id', async () => {
    stubStandardFetch();
    const connector = new CloudflareConnector();
    jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([]);
    services.targetsService.createMultipleTargets.mockResolvedValue({
      created: [{ id: 'target-new', value: 'example.com' }],
      skipped: [],
      totalRequested: 1,
      totalCreated: 1,
      totalSkipped: 0,
    });

    const config = makeConfig(services);
    const result = await connector.syncAssets(config);

    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledWith(
      'ws-1',
      ['example.com'],
    );
    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledWith(
      { targets: [{ value: 'example.com', type: 'DOMAIN' }] },
      'ws-1',
      services.actingUserContext,
      undefined,
      TargetSource.CLOUDFLARE,
    );
    // Regression guard: the source must NEVER land in internalNetworkId
    // (4th arg) — it must reach the source slot (5th arg) so the created
    // target carries the CLOUDFLARE source instead of defaulting to MANUAL.
    expect(
      services.targetsService.createMultipleTargets.mock.calls[0][3],
    ).toBeUndefined();
    expect(services.targetsService.createMultipleTargets.mock.calls[0][4]).toBe(
      TargetSource.CLOUDFLARE,
    );
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledTimes(1);
    expect(
      services.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith('target-new', expect.any(Array));
    expect(result.targetsCreated).toBe(1);
    expect(result.assetsUpserted).toBe(2);
  });

  it('SC-ING-2: target exists → createMultipleTargets NOT called, upsert under existing id', async () => {
    stubStandardFetch();
    const connector = new CloudflareConnector();
    jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'target-existing', value: 'example.com' },
    ]);

    const config = makeConfig(services);
    const result = await connector.syncAssets(config);

    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(
      services.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith('target-existing', expect.any(Array));
    expect(result.targetsCreated).toBe(0);
  });

  it('SC-ING-3: duplicate race — create rejects with "Target already exists", re-lookup succeeds, no throw', async () => {
    stubStandardFetch();
    const connector = new CloudflareConnector();
    jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues
      .mockResolvedValueOnce([]) // first lookup: missing
      .mockResolvedValueOnce([{ id: 'target-race', value: 'example.com' }]); // re-lookup after race
    services.targetsService.createMultipleTargets.mockRejectedValue(
      new BadRequestException('Target already exists: example.com'),
    );

    const config = makeConfig(services);
    await expect(connector.syncAssets(config)).resolves.toMatchObject({
      targetsCreated: 0,
    });

    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(2);
    expect(
      services.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith('target-race', expect.any(Array));
  });

  it('SC-ING-4: idempotency — two runs with same data → no throw, same counts, same asset set', async () => {
    const connector = new CloudflareConnector();
    jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'target-existing', value: 'example.com' },
    ]);

    const config = makeConfig(services);

    stubStandardFetch();
    const run1 = await connector.syncAssets(config);
    stubStandardFetch();
    const run2 = await connector.syncAssets(config);

    expect(run1).toEqual(run2);
    const upsertMock = services.dataAdapterService
      .upsertAssetsByTargetId;
    expect(upsertMock).toHaveBeenCalledTimes(2);
    const batch1 = upsertMock.mock.calls[0][1] as Array<{
      value: string;
      dnsRecords: Record<string, string[]>;
    }>;
    const batch2 = upsertMock.mock.calls[1][1] as Array<{
      value: string;
      dnsRecords: Record<string, string[]>;
    }>;
    expect(batch2).toEqual(batch1);
  });

  it('SC-ING-5: same hostname twice in records → 1 asset in the upsert batch', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(zonePageWith([ZONE], 1, 1)))
      .mockResolvedValueOnce(
        mockResponse(
          pageWith([
            record('A', 'www.example.com', '192.0.2.2'),
            record('A', 'www.example.com', '192.0.2.2'), // duplicate content
            record('AAAA', 'www.example.com', '2001:db8::1'),
          ]),
        ),
      );
    const connector = new CloudflareConnector();
    jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'target-existing', value: 'example.com' },
    ]);

    const config = makeConfig(services);
    await connector.syncAssets(config);

    const upsertMock = services.dataAdapterService
      .upsertAssetsByTargetId;
    const batch = upsertMock.mock.calls[0][1] as Array<{
      value: string;
      dnsRecords: Record<string, string[]>;
    }>;
    const www = batch.filter((a) => a.value === 'www.example.com');
    expect(www).toHaveLength(1);
    expect(www[0].dnsRecords.A).toEqual(['192.0.2.2']);
    expect(www[0].dnsRecords.AAAA).toEqual(['2001:db8::1']);
  });
});
