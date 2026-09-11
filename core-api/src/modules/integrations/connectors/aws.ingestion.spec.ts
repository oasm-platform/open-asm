import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AwsConnector } from './aws.connector';
import type { CreateMultipleTargetsDto } from '../../targets/dto/targets.dto';
import { TargetSource } from '../../targets/entities/target.entity';
import {
  getCallerIdentity,
  listOrganizationAccounts,
  resolveAwsCredentials,
} from './aws/aws.credentials';
import {
  discoverApiGateway,
  discoverCloudFront,
  discoverEc2,
  discoverElbv2,
  discoverRds,
  discoverRoute53,
  discoverS3,
  listEnabledRegions,
  type Candidate,
} from './aws/aws.discovery';

/**
 * Ingestion algorithm tests. The SDK + discovery layers are mocked; the target
 * and data-adapter services are plain jest.fn objects.
 */

jest.mock('./aws/aws.credentials', () => ({
  resolveAwsCredentials: jest.fn(),
  listOrganizationAccounts: jest.fn(),
  getCallerIdentity: jest.fn(),
}));

jest.mock('./aws/aws.discovery', () => {
  const actual = jest.requireActual<{
    MAX_API_CALLS_PER_SYNC: number;
    MAX_REGION_CONCURRENCY: number;
    isValidDomain: (value: string) => boolean;
    isValidPublicIp: (value: string) => boolean;
  }>('./aws/aws.discovery');
  return {
    MAX_API_CALLS_PER_SYNC: actual.MAX_API_CALLS_PER_SYNC,
    MAX_REGION_CONCURRENCY: actual.MAX_REGION_CONCURRENCY,
    isValidDomain: actual.isValidDomain,
    isValidPublicIp: actual.isValidPublicIp,
    discoverRoute53: jest.fn(),
    discoverCloudFront: jest.fn(),
    discoverS3: jest.fn(),
    discoverEc2: jest.fn(),
    discoverElbv2: jest.fn(),
    discoverApiGateway: jest.fn(),
    discoverRds: jest.fn(),
    listEnabledRegions: jest.fn(),
  };
});

const DISCOVERY_MOCKS = [
  discoverRoute53,
  discoverCloudFront,
  discoverS3,
  discoverEc2,
  discoverElbv2,
  discoverApiGateway,
  discoverRds,
];

const CREDENTIALS = { accessKeyId: 'AKIA', secretAccessKey: 'secret' };

function candidate(
  value: string,
  type: 'DOMAIN' | 'IP' = 'DOMAIN',
  kind = 'ec2-instance',
): Candidate {
  return {
    value,
    type,
    dnsRecords: {
      A: ['192.0.2.1'],
      AAAA: [],
      CNAME: [],
      MX: [],
      NS: [],
      SOA: [],
      TXT: [],
    },
    kind,
  };
}

function makeServices(overrides: Record<string, unknown> = {}) {
  return {
    targetsService: {
      findByWorkspaceAndValues: jest.fn().mockResolvedValue([]),
      createMultipleTargets: jest
        .fn()
        .mockImplementation((dto: CreateMultipleTargetsDto) =>
          Promise.resolve({
            created: dto.targets.map((target) => ({
              id: `t-${target.value}`,
              value: target.value,
            })),
            skipped: [],
            totalRequested: dto.targets.length,
            totalCreated: dto.targets.length,
            totalSkipped: 0,
          }),
        ),
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
    connectionMethod: 'accessKey',
    region: 'us-east-1',
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    workspaceId: 'ws-1',
    integrationId: 'int-1',
    ...makeServices(),
    ...overrides,
  };
}

describe('AwsConnector ingestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveAwsCredentials).mockResolvedValue({
      credentials: CREDENTIALS,
      region: 'us-east-1',
    });
    jest
      .mocked(listOrganizationAccounts)
      .mockResolvedValue([{ accountId: '111' }]);
    jest.mocked(getCallerIdentity).mockResolvedValue({ $metadata: {} });
    jest
      .mocked(listEnabledRegions)
      .mockResolvedValue({ regions: ['us-east-1'], truncated: false });
    for (const discover of DISCOVERY_MOCKS) {
      jest
        .mocked(discover)
        .mockResolvedValue({ candidates: [], truncated: false });
    }
  });

  it('ING-1: missing targets are pre-looked-up then created with TargetSource.AWS (5th arg, 4th undefined)', async () => {
    jest.mocked(discoverEc2).mockResolvedValue({
      candidates: [candidate('example.com'), candidate('www.example.com')],
      truncated: false,
    });

    const config = makeConfig();
    const result = await new AwsConnector().syncAssets(config);

    expect(config.targetsService.findByWorkspaceAndValues).toHaveBeenCalledWith(
      'ws-1',
      ['example.com', 'www.example.com'],
    );
    expect(config.targetsService.createMultipleTargets).toHaveBeenCalledWith(
      {
        targets: [
          { value: 'example.com', type: 'DOMAIN' },
          { value: 'www.example.com', type: 'DOMAIN' },
        ],
      },
      'ws-1',
      config.actingUserContext,
      undefined,
      TargetSource.AWS,
    );
    // Regression guard: the source must reach the source slot (5th arg), never
    // internalNetworkId (4th).
    expect(
      config.targetsService.createMultipleTargets.mock.calls[0][3],
    ).toBeUndefined();
    expect(config.targetsService.createMultipleTargets.mock.calls[0][4]).toBe(
      TargetSource.AWS,
    );
    expect(
      config.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith(
      't-example.com',
      [{ value: 'example.com', dnsRecords: expect.any(Object) }],
      undefined,
      { replaceDnsRecords: true },
    );
    expect(result.targetsCreated).toBe(2);
    expect(result.assetsUpserted).toBe(2);
  });

  it('ING-2: existing targets are skipped by lookup — no create, upsert under the existing id', async () => {
    jest
      .mocked(discoverEc2)
      .mockResolvedValue({ candidates: [candidate('example.com')], truncated: false });
    const config = makeConfig();
    config.targetsService.findByWorkspaceAndValues.mockResolvedValue([
      { id: 'existing-1', value: 'example.com' },
    ]);

    const result = await new AwsConnector().syncAssets(config);

    expect(config.targetsService.createMultipleTargets).not.toHaveBeenCalled();
    expect(
      config.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith(
      'existing-1',
      [{ value: 'example.com', dnsRecords: expect.any(Object) }],
      undefined,
      { replaceDnsRecords: true },
    );
    expect(result.targetsCreated).toBe(0);
  });

  it('ING-3: duplicate race (BadRequestException) — re-lookup resolves, no throw', async () => {
    jest
      .mocked(discoverEc2)
      .mockResolvedValue({ candidates: [candidate('example.com')], truncated: false });
    const config = makeConfig();
    config.targetsService.findByWorkspaceAndValues
      .mockResolvedValueOnce([]) // initial lookup: missing
      .mockResolvedValueOnce([{ id: 'race-1', value: 'example.com' }]); // re-lookup
    config.targetsService.createMultipleTargets.mockRejectedValue(
      new BadRequestException('Target already exists: example.com'),
    );

    const result = await new AwsConnector().syncAssets(config);

    expect(config.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    expect(config.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(
      2,
    );
    expect(
      config.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith(
      'race-1',
      [{ value: 'example.com', dnsRecords: expect.any(Object) }],
      undefined,
      { replaceDnsRecords: true },
    );
    expect(result.targetsCreated).toBe(0);
  });

  it('ING-3a: duplicate race via PG 23505 re-lookup resolves, no throw', async () => {
    jest
      .mocked(discoverEc2)
      .mockResolvedValue({ candidates: [candidate('example.com')], truncated: false });
    const config = makeConfig();
    config.targetsService.findByWorkspaceAndValues
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'race-2', value: 'example.com' }]);
    config.targetsService.createMultipleTargets.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      ),
    );

    const result = await new AwsConnector().syncAssets(config);

    expect(config.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    expect(result.targetsCreated).toBe(0);
    expect(
      config.dataAdapterService.upsertAssetsByTargetId,
    ).toHaveBeenCalledWith(
      'race-2',
      expect.any(Array),
      undefined,
      { replaceDnsRecords: true },
    );
  });

  it('ING-4: a chunk with one bad value still creates the valid ones (per-value fallback)', async () => {
    jest.mocked(discoverEc2).mockResolvedValue({
      candidates: [
        candidate('a.example.com'),
        candidate('b.example.com'),
        candidate('c.example.com'),
      ],
      truncated: false,
    });
    const config = makeConfig();
    config.targetsService.findByWorkspaceAndValues.mockResolvedValue([]);
    config.targetsService.createMultipleTargets.mockImplementation(
      (dto: CreateMultipleTargetsDto) => {
        // A multi-value batch aborts on the one bad value (repo service
        // validates the whole batch up front).
        if (dto.targets.length > 1) {
          return Promise.reject(
            new BadRequestException('Invalid target value: c.example.com'),
          );
        }
        if (dto.targets[0].value === 'c.example.com') {
          return Promise.reject(
            new BadRequestException('Invalid target value: c.example.com'),
          );
        }
        return Promise.resolve({
          created: [
            { id: `t-${dto.targets[0].value}`, value: dto.targets[0].value },
          ],
          skipped: [],
          totalRequested: 1,
          totalCreated: 1,
          totalSkipped: 0,
        });
      },
    );

    const result = await new AwsConnector().syncAssets(config);

    // a + b created; c is logged + skipped, never aborting the sync.
    expect(result.targetsCreated).toBe(2);
    expect(result.assetsUpserted).toBe(2);
    const upserted = config.dataAdapterService.upsertAssetsByTargetId.mock.calls.map(
      (call) => (call[1] as Array<{ value: string }>)[0].value,
    );
    expect(upserted).toEqual(['a.example.com', 'b.example.com']);
  });

  it('ING-5: duplicate/wildcard/invalid values are normalized away before lookup', async () => {
    jest.mocked(discoverEc2).mockResolvedValue({
      candidates: [
        candidate('example.com'),
        candidate('example.com.'), // trailing dot → same value
        candidate('*.example.com'), // wildcard → dropped
        candidate('bad_value'), // fails domain validation → dropped
      ],
      truncated: false,
    });
    const config = makeConfig();

    const result = await new AwsConnector().syncAssets(config);

    expect(config.targetsService.findByWorkspaceAndValues).toHaveBeenCalledWith(
      'ws-1',
      ['example.com'],
    );
    expect(config.targetsService.createMultipleTargets).toHaveBeenCalledTimes(1);
    const created = config.targetsService.createMultipleTargets.mock
      .calls[0][0] as CreateMultipleTargetsDto;
    expect(created.targets).toEqual([
      { value: 'example.com', type: 'DOMAIN' },
    ]);
    expect(result.targetsCreated).toBe(1);
  });

  it('ING-6: candidate count above MAX_TARGETS_PER_SYNC truncates to 5000 and flags truncated', async () => {
    const candidates: Candidate[] = [];
    for (let i = 0; i < 6000; i++) {
      candidates.push(candidate(`d${i}.example.com`));
    }
    jest
      .mocked(discoverEc2)
      .mockResolvedValue({ candidates, truncated: false });

    const config = makeConfig();
    config.dataAdapterService.upsertAssetsByTargetId.mockResolvedValue(0);

    const result = await new AwsConnector().syncAssets(config);

    expect(result.truncated).toBe(true);
    expect(result.targetsCreated).toBe(5000);
    // First lookup page is the 500-value batch size, proving chunking.
    const firstLookup = config.targetsService.findByWorkspaceAndValues.mock
      .calls[0][1] as string[];
    expect(firstLookup).toHaveLength(500);
  });
});
