import { CloudflareConnector, CloudflareSyncError } from './cloudflare.connector';

/**
 * Connector fetch-layer tests (SC-CONN-1..7).
 * Global fetch is mocked; service calls are mocked so ingestion does not touch DB.
 */

const ZONE_A = { id: 'zone-a', name: 'example.com', status: 'active' };
const ZONE_B = { id: 'zone-b', name: 'example.net', status: 'active' };
const ZONE_C = { id: 'zone-c', name: 'example.org', status: 'active' };

function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function zonePage(result: unknown[], page: number, totalPages: number): unknown {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    result_info: {
      count: result.length,
      page,
      per_page: 50,
      total_count: result.length * totalPages,
      total_pages: totalPages,
    },
  };
}

function recordsPage(result: unknown[], page: number, totalPages: number): unknown {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    result_info: {
      count: result.length,
      page,
      per_page: 5000,
      total_count: result.length * totalPages,
      total_pages: totalPages,
    },
  };
}

const record = (type: string, name: string, content: string) => ({
  id: `${type}-${name}-${content}`,
  type,
  name,
  content,
});

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    apiToken: 'test-token',
    workspaceId: 'ws-1',
    integrationId: 'integration-1',
    zoneFilter: { status: 'active' },
    targetsService: {
      // Default: every queried apex already has a target (no creates needed)
      findByWorkspaceAndValues: jest.fn().mockImplementation(
        (_ws: string, values: string[]) =>
          Promise.resolve(
            values.map((value) => ({ id: `target-${value}`, value })),
          ),
      ),
      createMultipleTargets: jest.fn(),
    },
    dataAdapterService: {
      upsertAssetsByTargetId: jest.fn().mockResolvedValue(2),
    },
    actingUserContext: { id: 'user-1', userId: 'user-1' },
    ...overrides,
  };
}

describe('CloudflareConnector', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      mockResponse({ success: true, errors: [], result: [], result_info: null }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncAssets', () => {
    it('SC-CONN-1: happy path — 2 zone pages × 2 record pages returns correct counts and 7-key dnsRecords shape', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      const zonesPage1 = zonePage([ZONE_A, ZONE_B], 1, 2);
      const zonesPage2 = zonePage([ZONE_C], 2, 2);

      const recPage1A = recordsPage(
        [
          record('A', 'example.com', '192.0.2.1'),
          record('A', 'example.com', '192.0.2.1'), // duplicate content — deduped
          record('MX', 'example.com', '10 mx.example.com'),
          record('A', 'www.example.com', '192.0.2.2'),
        ],
        1,
        2,
      );
      const recPage2A = recordsPage(
        [
          record('AAAA', 'api.example.com', '2001:db8::1'),
          record('CNAME', 'mail.example.com', 'mail.mx.cloudflare.net'),
          record('TXT', 'example.com', 'v=spf1 include:_spf.example.com ~all'),
        ],
        2,
        2,
      );
      const recPage1B = recordsPage([record('A', 'example.net', '192.0.2.10')], 1, 2);
      const recPage2B = recordsPage([record('NS', 'example.net', 'ns1.cloudflare.com')], 2, 2);
      const recPage1C = recordsPage([record('SOA', 'example.org', 'ns1.cloudflare.com')], 1, 2);
      const recPage2C = recordsPage([record('AAAA', 'example.org', '2001:db8::2')], 2, 2);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonesPage1))
        .mockResolvedValueOnce(mockResponse(zonesPage2))
        .mockResolvedValueOnce(mockResponse(recPage1A))
        .mockResolvedValueOnce(mockResponse(recPage2A))
        .mockResolvedValueOnce(mockResponse(recPage1B))
        .mockResolvedValueOnce(mockResponse(recPage2B))
        .mockResolvedValueOnce(mockResponse(recPage1C))
        .mockResolvedValueOnce(mockResponse(recPage2C));

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      // 3 zones across 2 pages; 4+3 + 1+1 + 1+1 = 11 records fetched
      expect(result.zones).toBe(3);
      expect(result.records).toBe(11);
      expect(result.wildcardZones).toBe(0);
      expect(result.targetsCreated).toBe(0);
      // upsertAssetsByTargetId resolved 2 per zone → 3 zones × 2
      expect(result.assetsUpserted).toBe(6);

      const upsertMock = config.dataAdapterService
        .upsertAssetsByTargetId;
      expect(upsertMock).toHaveBeenCalledTimes(3);

      // dnsRecords shape: all 7 keys present, values grouped by type
      const firstBatch = upsertMock.mock.calls[0][1] as Array<{
        value: string;
        dnsRecords: Record<string, string[]>;
      }>;
      const apex = firstBatch.find((a) => a.value === 'example.com');
      expect(apex).toBeDefined();
      expect(Object.keys(apex!.dnsRecords).sort()).toEqual([
        'A',
        'AAAA',
        'CNAME',
        'MX',
        'NS',
        'SOA',
        'TXT',
      ]);
      expect(apex!.dnsRecords.A).toEqual(['192.0.2.1']); // duplicate content removed
      expect(apex!.dnsRecords.MX).toEqual(['10 mx.example.com']);
      expect(apex!.dnsRecords.TXT).toEqual([
        'v=spf1 include:_spf.example.com ~all',
      ]);

      const www = firstBatch.find((a) => a.value === 'www.example.com');
      expect(www!.dnsRecords).toEqual({
        A: ['192.0.2.2'],
        AAAA: [],
        CNAME: [],
        MX: [],
        NS: [],
        SOA: [],
        TXT: [],
      });
    });

    it('SC-CONN-2: zone with zero records — no throw, records 0', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1)))
        .mockResolvedValueOnce(mockResponse(recordsPage([], 1, 1)));

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      expect(result.zones).toBe(1);
      expect(result.records).toBe(0);
      expect(result.assetsUpserted).toBe(0);
      // Nothing materialized → no upsert call
      expect(config.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
    });

    it('SC-CONN-3: wildcard-only zone — record not materialized, wildcardZones incremented', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1)))
        .mockResolvedValueOnce(
          mockResponse(recordsPage([record('A', '*.example.com', '192.0.2.99')], 1, 1)),
        );

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      expect(result.wildcardZones).toBe(1);
      expect(result.records).toBe(1);
      expect(result.assetsUpserted).toBe(0);
      expect(config.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
    });

    it('SC-CONN-4: punycode names kept verbatim', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      const punyZone = { id: 'zone-p', name: 'xn--example-9db.com', status: 'active' };
      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([punyZone], 1, 1)))
        .mockResolvedValueOnce(
          mockResponse(
            recordsPage([record('A', 'xn--sub-9db.xn--example-9db.com', '192.0.2.7')], 1, 1),
          ),
        );

      const findByWorkspaceAndValues = jest
        .fn()
        .mockResolvedValue([{ id: 'target-p', value: 'xn--example-9db.com' }]);
      const upsertAssetsByTargetId = jest.fn().mockResolvedValue(1);
      const config = makeConfig({
        targetsService: { findByWorkspaceAndValues, createMultipleTargets: jest.fn() },
        dataAdapterService: { upsertAssetsByTargetId },
      });

      const result = await connector.syncAssets(config);

      expect(findByWorkspaceAndValues).toHaveBeenCalledWith('ws-1', [
        'xn--example-9db.com',
      ]);
      const batch = upsertAssetsByTargetId.mock.calls[0][1] as Array<{
        value: string;
      }>;
      expect(batch.map((a) => a.value)).toContain('xn--sub-9db.xn--example-9db.com');
      expect(result.records).toBe(1);
    });

    it('SC-CONN-5: 429 then success — retries, fetch called 2× for that request', async () => {
      const connector = new CloudflareConnector();
      const sleepSpy = jest
        .spyOn(connector as any, 'sleep')
        .mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1), 429, { 'retry-after': '2' }))
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1)))
        .mockResolvedValueOnce(mockResponse(recordsPage([record('A', 'example.com', '192.0.2.1')], 1, 1)));

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      expect(result.zones).toBe(1);
      const zoneCalls = mockFetch.mock.calls.filter((call) =>
        String(call[0]).includes('/zones?'),
      );
      expect(zoneCalls).toHaveLength(2);
      expect(zoneCalls[0][0]).toBe(zoneCalls[1][0]); // same request retried
      expect(sleepSpy).toHaveBeenCalledWith(2 * 1000); // retry-after 2s honored
    });

    it('SC-CONN-6: persistent 429 (>3 attempts) rejects with CloudflareSyncError', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse({}, 429, { 'retry-after': '5' }))
        .mockResolvedValueOnce(mockResponse({}, 429, { 'retry-after': '5' }))
        .mockResolvedValueOnce(mockResponse({}, 429, { 'retry-after': '5' }));

      const config = makeConfig();
      await expect(connector.syncAssets(config)).rejects.toThrow(CloudflareSyncError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('SC-CONN-7: __dryRun true — no DB write methods called, counts returned', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1)))
        .mockResolvedValueOnce(
          mockResponse(recordsPage([record('A', 'www.example.com', '192.0.2.2')], 1, 1)),
        );

      const config = makeConfig({ __dryRun: true });
      const result = await connector.syncAssets(config);

      expect(result.zones).toBe(1);
      expect(result.records).toBe(1);
      expect(config.targetsService.findByWorkspaceAndValues).not.toHaveBeenCalled();
      expect(config.targetsService.createMultipleTargets).not.toHaveBeenCalled();
      expect(config.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
    });

    it('SC-CONN-8: Cloudflare AAAA discard-prefix placeholders (100::) are dropped, real AAAA and A kept', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1)))
        .mockResolvedValueOnce(
          mockResponse(
            recordsPage(
              [
                // Cloudflare placeholder content for proxied/originless hostnames (RFC 6666)
                record('AAAA', 'host.example.com', '100::'),
                record('AAAA', 'host.example.com', '100::1'),
                // Real, routable AAAA — must be kept
                record('AAAA', 'host.example.com', '2606:4700:3037::6815:1234'),
                // A record on the same hostname — must be kept
                record('A', 'host.example.com', '192.0.2.1'),
              ],
              1,
              1,
            ),
          ),
        );

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      // Placeholders still counted in the raw record count (counted before normalization)
      expect(result.records).toBe(4);

      const upsertMock = config.dataAdapterService.upsertAssetsByTargetId;
      expect(upsertMock).toHaveBeenCalledTimes(1);
      const batch = upsertMock.mock.calls[0][1] as Array<{
        value: string;
        dnsRecords: Record<string, string[]>;
      }>;
      const host = batch.find((a) => a.value === 'host.example.com');
      expect(host).toBeDefined();
      // AAAA placeholder contents are expected to be dropped — NOT materialized
      expect(host!.dnsRecords.AAAA).not.toContain('100::');
      expect(host!.dnsRecords.AAAA).not.toContain('100::1');
      expect(host!.dnsRecords.AAAA).toEqual(['2606:4700:3037::6815:1234']);
      expect(host!.dnsRecords.A).toEqual(['192.0.2.1']);
    });

    it('SC-CONN-9: hostname whose ONLY record is a 100:: AAAA placeholder is not materialized (counted, not stored)', async () => {
      const connector = new CloudflareConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(zonePage([ZONE_A], 1, 1)))
        .mockResolvedValueOnce(
          mockResponse(
            recordsPage([record('AAAA', 'discard.example.com', '100::')], 1, 1),
          ),
        );

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      expect(result.records).toBe(1); // still counted before normalization
      // No materialized assets → no upsert call (same as wildcard-only zone)
      expect(config.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
    });
  });
});
