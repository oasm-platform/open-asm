import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { VercelConnector } from './vercel.connector';
import { TargetSource } from '../../targets/entities/target.entity';

/**
 * Vercel connector ingestion tests (ING-*).
 * Global fetch is mocked (discovery is already covered by
 * vercel.connector.spec.ts); the target + data-adapter services are plain
 * jest.fn objects so every write call and its exact arguments can be asserted.
 */

const PROJECT_A = { id: 'prj_a', name: 'site-a' };
const PROJECT_B = { id: 'prj_b', name: 'site-b' };

/** Canonical empty 7-key dnsRecords shape the connector must reuse. */
const EMPTY_DNS_RECORDS = {
  A: [],
  AAAA: [],
  CNAME: [],
  MX: [],
  NS: [],
  SOA: [],
  TXT: [],
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(
        typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      ),
  } as unknown as Response;
}

function projectsPage(projects: unknown[]): unknown {
  return { projects, pagination: {} };
}

function domainsPage(domains: unknown[]): unknown {
  return { domains, pagination: {} };
}

interface DomainOverrides {
  name?: string;
  apexName?: string;
  verified?: boolean;
  redirect?: string;
  gitBranch?: string;
  customEnvironmentId?: string;
}

function domain(overrides: DomainOverrides = {}): unknown {
  return {
    name: 'www.example.com',
    apexName: 'example.com',
    verified: true,
    ...overrides,
  };
}

function makeServices(overrides: Record<string, unknown> = {}) {
  return {
    targetsService: {
      findByWorkspaceAndValues: jest.fn(),
      createMultipleTargets: jest.fn(),
    },
    dataAdapterService: {
      upsertAssetsByTargetId: jest.fn().mockResolvedValue(1),
    },
    actingUserContext: { id: 'user-1', userId: 'user-1' },
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    apiToken: 'vercel-token',
    workspaceId: 'ws-1',
    integrationId: 'integration-1',
    ...makeServices(),
    ...overrides,
  };
}

function createResult(id: string, value: string) {
  return {
    created: [{ id, value }],
    skipped: [],
    totalRequested: 1,
    totalCreated: 1,
    totalSkipped: 0,
  };
}

describe('VercelConnector ingestion', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(mockResponse(projectsPage([])));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** One project, one terminal domains page. */
  function stubSingleProjectFetch(domains: unknown[]): void {
    mockFetch
      .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
      .mockResolvedValueOnce(mockResponse(domainsPage(domains)));
  }

  function spySleep(connector: VercelConnector): void {
    jest.spyOn(connector as unknown as { sleep: () => void }, 'sleep').mockResolvedValue(undefined as never);
  }

  it('ING-1: a verified production domain creates a DOMAIN target with the VERCEL source and upserts the hostname with empty dnsRecords + undefined opts', async () => {
    stubSingleProjectFetch([domain()]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([]);
    services.targetsService.createMultipleTargets.mockResolvedValue(
      createResult('target-new', 'example.com'),
    );
    services.dataAdapterService.upsertAssetsByTargetId.mockResolvedValue(1);

    const result = await connector.syncAssets(makeConfig(services));

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
      TargetSource.VERCEL,
    );
    // Regression guards: source in the source slot (5th arg), never in
    // internalNetworkId (4th arg) where it would be silently ignored.
    expect(
      services.targetsService.createMultipleTargets.mock.calls[0][3],
    ).toBeUndefined();
    expect(services.targetsService.createMultipleTargets.mock.calls[0][4]).toBe(
      TargetSource.VERCEL,
    );

    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledTimes(1);
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledWith(
      'target-new',
      [{ value: 'www.example.com', dnsRecords: EMPTY_DNS_RECORDS }],
      undefined,
      undefined,
    );
    // Data-loss guard: opts must be undefined so the apex dnsRecords are
    // merged, never replaced with the empty shape.
    expect(
      services.dataAdapterService.upsertAssetsByTargetId.mock.calls[0][3],
    ).toBeUndefined();

    expect(result.targetsCreated).toBe(1);
    expect(result.assetsUpserted).toBe(1);
  });

  it('ING-2: an existing target is reused (no create) and assets upsert under its id', async () => {
    stubSingleProjectFetch([domain()]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'target-existing', value: 'example.com' },
    ]);
    services.dataAdapterService.upsertAssetsByTargetId.mockResolvedValue(3);

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(1);
    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledWith(
      'target-existing',
      [{ value: 'www.example.com', dnsRecords: EMPTY_DNS_RECORDS }],
      undefined,
      undefined,
    );
    expect(result.targetsCreated).toBe(0);
    expect(result.assetsUpserted).toBe(3);
  });

  it('ING-3: two projects sharing one apex produce exactly 1 target and 1 globally-deduped upsert call', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A, PROJECT_B])))
      .mockResolvedValueOnce(
        mockResponse(domainsPage([domain({ name: 'www.example.com' })])),
      )
      .mockResolvedValueOnce(
        mockResponse(
          domainsPage([
            domain({ name: 'www.example.com' }), // duplicate across projects
            domain({ name: 'api.example.com' }),
          ]),
        ),
      );
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'target-existing', value: 'example.com' },
    ]);

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(1);
    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledTimes(1);
    const batch = services.dataAdapterService.upsertAssetsByTargetId.mock
      .calls[0][1] as Array<{ value: string }>;
    expect(batch.map((a) => a.value)).toEqual([
      'www.example.com',
      'api.example.com',
    ]);
    expect(result.targetsCreated).toBe(0);
  });

  it('ING-4: a project whose only verified host is www.example.com creates example.com but upserts ONLY www.example.com', async () => {
    stubSingleProjectFetch([domain({ name: 'www.example.com' })]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([]);
    services.targetsService.createMultipleTargets.mockResolvedValue(
      createResult('target-new', 'example.com'),
    );

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledWith(
      { targets: [{ value: 'example.com', type: 'DOMAIN' }] },
      'ws-1',
      services.actingUserContext,
      undefined,
      TargetSource.VERCEL,
    );
    const batch = services.dataAdapterService.upsertAssetsByTargetId.mock
      .calls[0][1] as Array<{ value: string }>;
    // The apex was NOT returned by the API → it must not be fabricated into
    // the batch (createMultipleTargets already inserts its own primary asset).
    expect(batch.map((a) => a.value)).toEqual(['www.example.com']);
    expect(result.targetsCreated).toBe(1);
  });

  it.each([
    ['redirect', { redirect: 'www.example.com' }],
    ['gitBranch', { gitBranch: 'preview' }],
    ['customEnvironmentId', { customEnvironmentId: 'env_1' }],
    ['wildcard', { name: '*.example.com' }],
  ] as Array<[string, DomainOverrides]>)(
    'ING-5: a %s row is dropped',
    async (_label, overrides) => {
      stubSingleProjectFetch([
        domain({ name: 'good.example.com' }),
        domain({ apexName: 'example.com', ...overrides }),
      ]);
      const connector = new VercelConnector();
      spySleep(connector);

      const services = makeServices();
      services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
        { id: 'target-existing', value: 'example.com' },
      ]);

      const result = await connector.syncAssets(makeConfig(services));

      const batch = services.dataAdapterService.upsertAssetsByTargetId.mock
        .calls[0][1] as Array<{ value: string }>;
      expect(batch.map((a) => a.value)).toEqual(['good.example.com']);
      expect(result.domains).toBe(1);
    },
  );

  it('ING-11: a default `<project>.vercel.app` domain creates a target keyed by the full hostname and upserts it', async () => {
    stubSingleProjectFetch([
      domain({ name: 'my-app.vercel.app', apexName: 'vercel.app' }),
    ]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([]);
    services.targetsService.createMultipleTargets.mockResolvedValue(
      createResult('target-vercel', 'my-app.vercel.app'),
    );

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledWith(
      'ws-1',
      ['my-app.vercel.app'],
    );
    // The shared `vercel.app` apex must never be the target value.
    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledWith(
      { targets: [{ value: 'my-app.vercel.app', type: 'DOMAIN' }] },
      'ws-1',
      services.actingUserContext,
      undefined,
      TargetSource.VERCEL,
    );
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledWith(
      'target-vercel',
      [{ value: 'my-app.vercel.app', dnsRecords: EMPTY_DNS_RECORDS }],
      undefined,
      undefined,
    );
    expect(result.domains).toBe(1);
    expect(result.targetsCreated).toBe(1);
  });

  it('ING-12: an unverified domain is still ingested (apex target + hostname asset)', async () => {
    stubSingleProjectFetch([
      domain({
        name: 'pending.example.com',
        apexName: 'example.com',
        verified: false,
      }),
    ]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'target-existing', value: 'example.com' },
    ]);

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledWith(
      'target-existing',
      [{ value: 'pending.example.com', dnsRecords: EMPTY_DNS_RECORDS }],
      undefined,
      undefined,
    );
    expect(result.domains).toBe(1);
  });

  it('ING-6a: a duplicate "Target already exists" race re-looks-up and does not throw', async () => {
    stubSingleProjectFetch([domain()]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues
      .mockResolvedValueOnce([]) // first lookup: missing
      .mockResolvedValueOnce([{ id: 'target-race', value: 'example.com' }]); // re-lookup
    services.targetsService.createMultipleTargets.mockRejectedValue(
      new BadRequestException('Target already exists: example.com'),
    );

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(2);
    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledWith(
      'target-race',
      [{ value: 'www.example.com', dnsRecords: EMPTY_DNS_RECORDS }],
      undefined,
      undefined,
    );
    expect(result.targetsCreated).toBe(0);
  });

  it('ING-6b: a 23505 unique-constraint race re-looks-up and does not throw', async () => {
    stubSingleProjectFetch([domain()]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    services.targetsService.findByWorkspaceAndValues
      .mockResolvedValueOnce([]) // first lookup: missing
      .mockResolvedValueOnce([{ id: 'target-race', value: 'example.com' }]); // re-lookup
    services.targetsService.createMultipleTargets.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      ),
    );

    const result = await connector.syncAssets(makeConfig(services));

    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(2);
    expect(services.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledWith(
      'target-race',
      [{ value: 'www.example.com', dnsRecords: EMPTY_DNS_RECORDS }],
      undefined,
      undefined,
    );
    expect(result.targetsCreated).toBe(0);
  });

  it('ING-7: __dryRun issues only the probe fetch and calls NONE of the three write-service methods', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    const config = makeConfig({ ...services, __dryRun: true });
    const result = await connector.syncAssets(config);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(services.targetsService.findByWorkspaceAndValues).not.toHaveBeenCalled();
    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(services.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
    expect(result.targetsCreated).toBe(0);
    expect(result.assetsUpserted).toBe(0);
    expect(result.tokenStatus).toBe('active');
  });

  it('ING-8: an exhausted maxSyncDurationMs sets truncated and stops before the next upsert', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
      .mockResolvedValueOnce(
        mockResponse(
          domainsPage([
            domain({ name: 'a.example.com', apexName: 'example.com' }),
            domain({ name: 'b.example.net', apexName: 'example.net' }),
          ]),
        ),
      );
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // The first (and only) target lookup burns the whole sync budget, so the
    // second apex group must be cut off after the first upsert.
    services.targetsService.findByWorkspaceAndValues.mockImplementation(() => {
      now += 2000;
      return Promise.resolve([{ id: 'target-existing', value: 'example.com' }]);
    });

    const result = await connector.syncAssets(
      makeConfig({ ...services, maxSyncDurationMs: 1000 }),
    );

    expect(result.truncated).toBe(true);
    expect(services.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(1);
    expect(services.dataAdapterService.upsertAssetsByTargetId).toHaveBeenCalledTimes(1);
  });

  it('ING-9: an invalid apex is skipped without any createMultipleTargets call', async () => {
    stubSingleProjectFetch([
      // No dot + TLD → not a valid apex; the whole group is dropped.
      domain({ name: 'x.invalid', apexName: 'invalid' }),
    ]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    const result = await connector.syncAssets(makeConfig(services));

    expect(result.domains).toBe(0);
    expect(services.targetsService.findByWorkspaceAndValues).not.toHaveBeenCalled();
    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(services.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
  });

  it('ING-10: an empty domain list performs no writes and does not throw', async () => {
    stubSingleProjectFetch([]);
    const connector = new VercelConnector();
    spySleep(connector);

    const services = makeServices();
    const result = await connector.syncAssets(makeConfig(services));

    expect(result.domains).toBe(0);
    expect(services.targetsService.findByWorkspaceAndValues).not.toHaveBeenCalled();
    expect(services.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(services.dataAdapterService.upsertAssetsByTargetId).not.toHaveBeenCalled();
  });
});
