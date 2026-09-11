import {
  resolveAwsCredentials,
  listOrganizationAccounts,
  getCallerIdentity,
} from './aws.credentials';
import type {
  AwsCredentialConfig,
  AwsResolvedCredentials,
} from './aws.credentials';

/**
 * Credential-strategy tests. The AWS SDK credential-provider factories and the
 * STS/Organizations clients are fully mocked — nothing reaches the network.
 * Command mocks capture their input so assertions inspect exact params.
 */

const mockFromTemporaryCredentials = jest.fn();
const mockFromWebToken = jest.fn();

jest.mock('@aws-sdk/credential-providers', () => ({
  fromTemporaryCredentials: (...args: unknown[]): unknown =>
    mockFromTemporaryCredentials(...args) as unknown,
  fromWebToken: (...args: unknown[]): unknown =>
    mockFromWebToken(...args) as unknown,
}));

const mockStsSend = jest.fn();
const mockGetCallerIdentityInputs: unknown[] = [];

jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({ send: mockStsSend })),
  GetCallerIdentityCommand: jest.fn().mockImplementation((input: unknown) => {
    mockGetCallerIdentityInputs.push(input);
    return { kind: 'GetCallerIdentity', input };
  }),
}));

const mockOrgSend = jest.fn();
const mockListAccountsInputs: unknown[] = [];

jest.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: jest.fn().mockImplementation(() => ({ send: mockOrgSend })),
  ListAccountsCommand: jest.fn().mockImplementation((input: unknown) => {
    mockListAccountsInputs.push(input);
    return { kind: 'ListAccounts', input };
  }),
}));

const PROVIDER = { __provider: true } as unknown as AwsResolvedCredentials;

function baseConfig(
  overrides: Partial<AwsCredentialConfig> = {},
): AwsCredentialConfig {
  return {
    connectionMethod: 'accessKey',
    region: 'us-east-1',
    ...overrides,
  };
}

describe('resolveAwsCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallerIdentityInputs.length = 0;
    mockListAccountsInputs.length = 0;
    mockFromTemporaryCredentials.mockReturnValue(PROVIDER);
    mockFromWebToken.mockReturnValue(PROVIDER);
  });

  describe('accessKey', () => {
    it('returns the static identity object and region', async () => {
      const result = await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'accessKey',
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          sessionToken: 'session',
        }),
      );

      expect(result).toEqual({
        credentials: {
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          sessionToken: 'session',
        },
        region: 'us-east-1',
      });
      expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
      expect(mockFromWebToken).not.toHaveBeenCalled();
    });

    it('rejects when the access key pair is missing', async () => {
      await expect(
        resolveAwsCredentials(baseConfig({ connectionMethod: 'accessKey' })),
      ).rejects.toThrow(/accessKey/i);
    });

    it('prefers regions[0] over region', async () => {
      const result = await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'accessKey',
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          region: 'us-east-1',
          regions: ['eu-west-1', 'us-west-2'],
        }),
      );
      expect(result.region).toBe('eu-west-1');
    });

    it('rejects when no region is provided', async () => {
      await expect(
        resolveAwsCredentials(
          baseConfig({
            connectionMethod: 'accessKey',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            region: '',
            regions: [],
          }),
        ),
      ).rejects.toThrow(/region is required/i);
    });
  });

  describe('assumeRole', () => {
    it('builds fromTemporaryCredentials with master creds and substitutes {accountId}', async () => {
      const result = await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'assumeRole',
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          sessionToken: 'session',
          roleArn: 'arn:aws:iam::{accountId}:role/Inventory',
          externalId: 'ext-1',
        }),
        '123456789012',
      );

      expect(result.credentials).toBe(PROVIDER);
      expect(result.region).toBe('us-east-1');
      expect(mockFromTemporaryCredentials).toHaveBeenCalledWith({
        masterCredentials: {
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          sessionToken: 'session',
        },
        params: {
          RoleArn: 'arn:aws:iam::123456789012:role/Inventory',
          RoleSessionName: 'oasm-inventory',
          ExternalId: 'ext-1',
          DurationSeconds: 3600,
        },
      });
      // No global chain provider referenced.
      expect(mockFromTemporaryCredentials.mock.calls[0][0]).not.toHaveProperty(
        'clientConfig',
      );
    });

    it('honors a custom roleSessionName', async () => {
      await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'assumeRole',
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          roleArn: 'arn:aws:iam::{accountId}:role/R',
          externalId: 'ext-1',
          roleSessionName: 'custom-session',
        }),
        '111111111111',
      );
      expect(mockFromTemporaryCredentials.mock.calls[0][0]).toMatchObject({
        params: { RoleSessionName: 'custom-session' },
      });
    });

    it('rejects missing base creds BEFORE any SDK call', async () => {
      await expect(
        resolveAwsCredentials(
          baseConfig({
            connectionMethod: 'assumeRole',
            roleArn: 'arn:aws:iam::{accountId}:role/R',
            externalId: 'ext-1',
          }),
          '111111111111',
        ),
      ).rejects.toThrow(/base credentials/i);
      expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
    });

    it('rejects missing externalId BEFORE any SDK call', async () => {
      await expect(
        resolveAwsCredentials(
          baseConfig({
            connectionMethod: 'assumeRole',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            roleArn: 'arn:aws:iam::{accountId}:role/R',
          }),
          '111111111111',
        ),
      ).rejects.toThrow(/externalId/i);
      expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
    });

    it('rejects a missing accountId for the loop', async () => {
      await expect(
        resolveAwsCredentials(
          baseConfig({
            connectionMethod: 'assumeRole',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            roleArn: 'arn:aws:iam::{accountId}:role/R',
            externalId: 'ext-1',
          }),
        ),
      ).rejects.toThrow(/accountId/i);
      expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
    });
  });

  describe('crossAccountRole', () => {
    it('uses the single provided roleArn verbatim (no {accountId} loop)', async () => {
      const result = await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'crossAccountRole',
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          roleArn: 'arn:aws:iam::999999999999:role/Cross',
          externalId: 'ext-2',
        }),
      );

      expect(result.credentials).toBe(PROVIDER);
      expect(mockFromTemporaryCredentials).toHaveBeenCalledWith({
        masterCredentials: {
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
        },
        params: {
          RoleArn: 'arn:aws:iam::999999999999:role/Cross',
          RoleSessionName: 'oasm-inventory',
          ExternalId: 'ext-2',
          DurationSeconds: 3600,
        },
      });
    });

    it('rejects missing externalId BEFORE any SDK call', async () => {
      await expect(
        resolveAwsCredentials(
          baseConfig({
            connectionMethod: 'crossAccountRole',
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            roleArn: 'arn:aws:iam::999999999999:role/Cross',
          }),
        ),
      ).rejects.toThrow(/externalId/i);
      expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
    });
  });

  describe('workloadIdentity', () => {
    it('builds fromWebToken with the token and session name', async () => {
      const result = await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'workloadIdentity',
          roleArn: 'arn:aws:iam::123456789012:role/Web',
          webIdentityToken: 'jwt-token',
        }),
      );

      expect(result.credentials).toBe(PROVIDER);
      expect(result.region).toBe('us-east-1');
      expect(mockFromWebToken).toHaveBeenCalledWith({
        roleArn: 'arn:aws:iam::123456789012:role/Web',
        webIdentityToken: 'jwt-token',
        roleSessionName: 'oasm-inventory',
      });
    });

    it('rejects a missing webIdentityToken BEFORE any SDK call', async () => {
      await expect(
        resolveAwsCredentials(
          baseConfig({
            connectionMethod: 'workloadIdentity',
            roleArn: 'arn:aws:iam::123456789012:role/Web',
          }),
        ),
      ).rejects.toThrow(/webIdentityToken/i);
      expect(mockFromWebToken).not.toHaveBeenCalled();
    });
  });

  describe('sso', () => {
    it('delegates to ssoService and propagates the rotated refresh token', async () => {
      const resolveCredentials = jest.fn().mockResolvedValue({
        credentials: {
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          sessionToken: 'session',
        },
        rotatedRefreshToken: 'refresh-2',
      });
      const result = await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'sso',
          ssoService: { resolveCredentials },
          clientId: 'client-1',
          clientSecret: 'secret-1',
          refreshToken: 'refresh-1',
          accountId: '111122223333',
          roleName: 'Admin',
        }),
      );

      expect(resolveCredentials).toHaveBeenCalledWith({
        region: 'us-east-1',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        refreshToken: 'refresh-1',
        accountId: '111122223333',
        roleName: 'Admin',
      });
      expect(result.rotatedRefreshToken).toBe('refresh-2');
      expect(result.region).toBe('us-east-1');
    });

    it('ignores the accountId function parameter in favor of config.accountId', async () => {
      const resolveCredentials = jest.fn().mockResolvedValue({
        credentials: {
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
        },
      });
      await resolveAwsCredentials(
        baseConfig({
          connectionMethod: 'sso',
          ssoService: { resolveCredentials },
          accountId: 'sso-target-account',
          roleName: 'Admin',
        }),
        'loop-account-id',
      );

      expect(resolveCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'sso-target-account' }),
      );
    });

    it('rejects when ssoService is absent', async () => {
      await expect(
        resolveAwsCredentials(baseConfig({ connectionMethod: 'sso' })),
      ).rejects.toThrow(/ssoService/i);
    });
  });
});

describe('listOrganizationAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListAccountsInputs.length = 0;
  });

  it('paginates until NextToken is null and keeps only ACTIVE accounts', async () => {
    mockOrgSend
      .mockResolvedValueOnce({
        Accounts: [
          { Id: '111', Name: 'prod', Email: 'prod@x.com', State: 'ACTIVE' },
          { Id: '222', Name: 'suspended', State: 'SUSPENDED' },
        ],
        NextToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Accounts: [
          { Id: '333', Name: 'dev', State: 'ACTIVE' },
          { Id: '444', Name: 'pending', State: 'PENDING_ACTIVATION' },
        ],
      });

    const accounts = await listOrganizationAccounts(PROVIDER);

    expect(accounts).toEqual([
      { accountId: '111', name: 'prod', email: 'prod@x.com' },
      { accountId: '333', name: 'dev', email: undefined },
    ]);
    expect(mockListAccountsInputs[0]).toEqual({ NextToken: undefined });
    expect(mockListAccountsInputs[1]).toEqual({ NextToken: 'page-2' });
  });
});

describe('getCallerIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallerIdentityInputs.length = 0;
  });

  it('sends GetCallerIdentityCommand with the supplied credentials', async () => {
    mockStsSend.mockResolvedValueOnce({ Account: '111', Arn: 'arn' });

    const result = await getCallerIdentity(PROVIDER);

    expect(result).toEqual({ Account: '111', Arn: 'arn' });
    expect(mockStsSend).toHaveBeenCalledTimes(1);
  });
});
