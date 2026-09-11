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
 * Connector orchestration tests. The AWS SDK layer (`aws.credentials`) and the
 * discovery layer (`aws.discovery`) are mocked — nothing reaches the network,
 * and no DB is touched.
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

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    connectionMethod: 'accessKey',
    region: 'us-east-1',
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    workspaceId: 'ws-1',
    integrationId: 'int-1',
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

describe('AwsConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveAwsCredentials).mockResolvedValue({
      credentials: CREDENTIALS,
      region: 'us-east-1',
    });
    jest
      .mocked(listOrganizationAccounts)
      .mockResolvedValue([{ accountId: '111', name: 'acct' }]);
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

  describe('beforeExecute', () => {
    it('CONN-VAL-1: valid accessKey config passes', async () => {
      await expect(
        new AwsConnector().beforeExecute(makeConfig()),
      ).resolves.toBeUndefined();
    });

    it('CONN-VAL-2: rejects a missing connectionMethod', () => {
      const cfg = makeConfig({ connectionMethod: undefined });
      expect(() => new AwsConnector().beforeExecute(cfg)).toThrow(
        'connectionMethod',
      );
    });

    it('CONN-VAL-3: rejects a missing region', () => {
      const cfg = makeConfig({ region: '', regions: [] });
      expect(() => new AwsConnector().beforeExecute(cfg)).toThrow('region');
    });

    it('CONN-VAL-4: assumeRole rejects without base credentials / roleArn / externalId', () => {
      const connector = new AwsConnector();
      expect(() =>
        connector.beforeExecute(
          makeConfig({
            connectionMethod: 'assumeRole',
            roleArn: 'arn:aws:iam::1:role/r',
            externalId: 'ext',
            accessKeyId: '',
          }),
        ),
      ).toThrow('accessKeyId');
      expect(() =>
        connector.beforeExecute(
          makeConfig({
            connectionMethod: 'assumeRole',
            accessKeyId: 'AKIA',
            secretAccessKey: 's',
          }),
        ),
      ).toThrow('roleArn');
      expect(() =>
        connector.beforeExecute(
          makeConfig({
            connectionMethod: 'assumeRole',
            roleArn: 'arn:aws:iam::1:role/r',
            accessKeyId: 'AKIA',
            secretAccessKey: 's',
          }),
        ),
      ).toThrow('externalId');
    });

    it('CONN-VAL-5: workloadIdentity rejects without a webIdentityToken', () => {
      expect(() =>
        new AwsConnector().beforeExecute(
          makeConfig({
            connectionMethod: 'workloadIdentity',
            roleArn: 'arn:aws:iam::1:role/r',
          }),
        ),
      ).toThrow('webIdentityToken');
    });
  });

  describe('syncAssets', () => {
    it('CONN-1: happy path — probe, enumerate regions, discover and ingest', async () => {
      jest
        .mocked(discoverEc2)
        .mockResolvedValue({ candidates: [candidate('a.example.com')], truncated: false });

      const config = makeConfig();
      const result = await new AwsConnector().syncAssets(config);

      expect(getCallerIdentity).toHaveBeenCalledWith(CREDENTIALS, 'us-east-1');
      expect(listEnabledRegions).toHaveBeenCalledTimes(1);
      expect(discoverEc2).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' }),
      );
      expect(config.targetsService.createMultipleTargets).toHaveBeenCalledWith(
        { targets: [{ value: 'a.example.com', type: 'DOMAIN' }] },
        'ws-1',
        config.actingUserContext,
        undefined,
        TargetSource.AWS,
      );
      expect(result).toMatchObject({
        targetsCreated: 1,
        assetsUpserted: 1,
        accounts: 1,
        regions: 1,
        truncated: false,
        byKind: { 'ec2-instance': 1 },
      });
      expect(
        (config as unknown as { __syncResult: unknown }).__syncResult,
      ).toBe(result);
    });

    it('CONN-2: assumeRole dry run probes the base identity AND assumes the first account role, writing nothing', async () => {
      jest
        .mocked(listOrganizationAccounts)
        .mockResolvedValue([{ accountId: '111' }, { accountId: '222' }]);
      jest.mocked(resolveAwsCredentials).mockResolvedValue({
        credentials: CREDENTIALS,
        region: 'us-east-1',
        rotatedRefreshToken: 'rotated',
      });

      const persistConfigPatch = jest.fn().mockResolvedValue(undefined);
      const config = makeConfig({
        connectionMethod: 'assumeRole',
        roleArn: 'arn:aws:iam::{accountId}:role/oasm',
        externalId: 'ext',
        __dryRun: true,
        persistConfigPatch,
      });

      const result = await new AwsConnector().syncAssets(config);

      // Base probe with the static credentials, scoped to the account loop.
      expect(listOrganizationAccounts).toHaveBeenCalledWith(
        { accessKeyId: 'AKIA', secretAccessKey: 'secret' },
        'us-east-1',
      );
      // Only the FIRST account's role is assumed (lazy provider forced).
      expect(resolveAwsCredentials).toHaveBeenCalledTimes(1);
      expect(resolveAwsCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ connectionMethod: 'assumeRole' }),
        '111',
      );
      expect(getCallerIdentity).toHaveBeenCalledWith(CREDENTIALS, 'us-east-1');

      expect(result.targetsCreated).toBe(0);
      expect(result.assetsUpserted).toBe(0);
      expect(config.targetsService.findByWorkspaceAndValues).not.toHaveBeenCalled();
      expect(config.targetsService.createMultipleTargets).not.toHaveBeenCalled();
      expect(
        config.dataAdapterService.upsertAssetsByTargetId,
      ).not.toHaveBeenCalled();
      // Dry run must never persist a rotated token.
      expect(persistConfigPatch).not.toHaveBeenCalled();
    });

    it('CONN-3: a base-credential failure FAILS the sync (never swallowed)', async () => {
      jest
        .mocked(getCallerIdentity)
        .mockRejectedValue(new Error('InvalidClientTokenId'));

      await expect(
        new AwsConnector().syncAssets(makeConfig()),
      ).rejects.toThrow('InvalidClientTokenId');
    });

    it('CONN-3a: an assumeRole base-probe (ListAccounts) failure FAILS the sync', async () => {
      jest
        .mocked(listOrganizationAccounts)
        .mockRejectedValue(new Error('InvalidClientTokenId'));

      await expect(
        new AwsConnector().syncAssets(
          makeConfig({
            connectionMethod: 'assumeRole',
            roleArn: 'arn:aws:iam::{accountId}:role/oasm',
            externalId: 'ext',
          }),
        ),
      ).rejects.toThrow('InvalidClientTokenId');
      expect(getCallerIdentity).not.toHaveBeenCalled();
    });

    it('CONN-4: a per-account AccessDenied is skipped; the other account still syncs', async () => {
      jest
        .mocked(listOrganizationAccounts)
        .mockResolvedValue([{ accountId: '111' }, { accountId: '222' }]);
      jest
        .mocked(getCallerIdentity)
        .mockRejectedValueOnce(
          Object.assign(new Error('not authorized to perform: sts:AssumeRole'), {
            name: 'AccessDenied',
          }),
        )
        .mockResolvedValueOnce({ $metadata: {} });
      jest
        .mocked(discoverEc2)
        .mockResolvedValue({ candidates: [candidate('b.example.com')], truncated: false });

      const config = makeConfig({
        connectionMethod: 'assumeRole',
        roleArn: 'arn:aws:iam::{accountId}:role/oasm',
        externalId: 'ext',
      });
      const result = await new AwsConnector().syncAssets(config);

      expect(resolveAwsCredentials).toHaveBeenCalledTimes(2);
      expect(getCallerIdentity).toHaveBeenCalledTimes(2);
      expect(result.accounts).toBe(1);
      expect(result.targetsCreated).toBe(1);
    });

    it('CONN-5: a truncated discovery envelope sets truncated:true and still ingests', async () => {
      jest.mocked(discoverEc2).mockResolvedValue({
        candidates: [candidate('a.example.com')],
        truncated: true,
      });

      const result = await new AwsConnector().syncAssets(makeConfig());

      expect(result.truncated).toBe(true);
      expect(result.targetsCreated).toBe(1);
    });

    it('CONN-6: a rotated SSO refresh token is persisted via persistConfigPatch', async () => {
      jest.mocked(resolveAwsCredentials).mockResolvedValue({
        credentials: CREDENTIALS,
        region: 'us-east-1',
        rotatedRefreshToken: 'new-token',
      });
      const persistConfigPatch = jest.fn().mockResolvedValue(undefined);

      await new AwsConnector().syncAssets(makeConfig({ persistConfigPatch }));

      expect(persistConfigPatch).toHaveBeenCalledWith({
        refreshToken: 'new-token',
      });
    });

    it('CONN-6a: no rotation → persistConfigPatch is not called', async () => {
      const persistConfigPatch = jest.fn().mockResolvedValue(undefined);

      await new AwsConnector().syncAssets(makeConfig({ persistConfigPatch }));

      expect(persistConfigPatch).not.toHaveBeenCalled();
    });

    it('CONN-7: config.regions allow-list is used (empty strings filtered); DescribeRegions is skipped', async () => {
      jest.mocked(resolveAwsCredentials).mockResolvedValue({
        credentials: CREDENTIALS,
        region: 'eu-west-1',
      });
      jest
        .mocked(discoverEc2)
        .mockResolvedValue({ candidates: [candidate('a.example.com')], truncated: false });

      const result = await new AwsConnector().syncAssets(
        makeConfig({ regions: ['eu-west-1', '  ', ''] }),
      );

      expect(listEnabledRegions).not.toHaveBeenCalled();
      expect(discoverEc2).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-west-1' }),
      );
      expect(result.regions).toBe(1);
    });

    it('CONN-8: exceeding maxSyncDurationMs truncates without throwing or discovering', async () => {
      const config = makeConfig({ maxSyncDurationMs: 0 });

      const result = await new AwsConnector().syncAssets(config);

      expect(result.truncated).toBe(true);
      expect(result.targetsCreated).toBe(0);
      expect(discoverEc2).not.toHaveBeenCalled();
    });
  });
});
