import { AwsSsoService } from './aws-sso.service';

/**
 * SSO device-flow tests. The AWS SDK clients are fully mocked; nothing hits
 * the network. Command mocks capture their input so assertions can inspect the
 * exact parameters the service sent.
 */

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-sso-oidc', () => ({
  SSOOIDCClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  RegisterClientCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ kind: 'RegisterClient', input })),
  StartDeviceAuthorizationCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({
      kind: 'StartDeviceAuthorization',
      input,
    })),
  CreateTokenCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ kind: 'CreateToken', input })),
}));

jest.mock('@aws-sdk/client-sso', () => ({
  SSOClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  ListAccountsCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ kind: 'ListAccounts', input })),
  ListAccountRolesCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ kind: 'ListAccountRoles', input })),
  GetRoleCredentialsCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({
      kind: 'GetRoleCredentials',
      input,
    })),
}));

interface SendInput {
  kind: string;
  input: Record<string, unknown>;
}

function lastInput(callIndex: number): Record<string, unknown> {
  return (mockSend.mock.calls[callIndex][0] as SendInput).input;
}

function lastKind(callIndex: number): string {
  return (mockSend.mock.calls[callIndex][0] as SendInput).kind;
}

/** SDK exceptions carry the OAuth error code on `.error`. */
function ssoError(error: string): Error {
  return Object.assign(new Error(error), { error });
}

describe('AwsSsoService', () => {
  let service: AwsSsoService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AwsSsoService();
  });

  describe('startDeviceAuth', () => {
    it('registers a client then starts the device flow and returns client credentials', async () => {
      mockSend
        .mockResolvedValueOnce({
          clientId: 'client-1',
          clientSecret: 'secret-1',
        })
        .mockResolvedValueOnce({
          deviceCode: 'device-1',
          userCode: 'ABCD-EFGH',
          verificationUri: 'https://device.sso.us-east-1.amazonaws.com/',
          verificationUriComplete: 'https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-EFGH',
          interval: 5,
          expiresIn: 600,
        });

      const result = await service.startDeviceAuth({
        region: 'us-east-1',
        startUrl: 'https://example.awsapps.com/start',
      });

      expect(lastKind(0)).toBe('RegisterClient');
      expect(lastInput(0)).toMatchObject({ clientType: 'public' });

      expect(lastKind(1)).toBe('StartDeviceAuthorization');
      expect(lastInput(1)).toMatchObject({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        startUrl: 'https://example.awsapps.com/start',
      });

      expect(result).toEqual({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        deviceCode: 'device-1',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://device.sso.us-east-1.amazonaws.com/',
        verificationUriComplete:
          'https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-EFGH',
        interval: 5,
        expiresIn: 600,
      });
    });

    it('rejects a missing startUrl before any SDK call', async () => {
      await expect(
        service.startDeviceAuth({ region: 'us-east-1', startUrl: '' }),
      ).rejects.toThrow(/start URL is required/i);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('pollDeviceAuth', () => {
    const args = {
      region: 'us-east-1',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      deviceCode: 'device-1',
    };

    it('maps authorization_pending → pending, slow_down → slow_down, then authorized', async () => {
      mockSend
        .mockRejectedValueOnce(ssoError('authorization_pending'))
        .mockRejectedValueOnce(ssoError('slow_down'))
        .mockResolvedValueOnce({
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          expiresIn: 3600,
        });

      await expect(service.pollDeviceAuth(args)).resolves.toEqual({
        status: 'pending',
      });
      await expect(service.pollDeviceAuth(args)).resolves.toEqual({
        status: 'slow_down',
      });
      await expect(service.pollDeviceAuth(args)).resolves.toEqual({
        status: 'authorized',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresIn: 3600,
      });

      // Every poll used the device-code grant with the persisted client.
      for (let i = 0; i < 3; i++) {
        expect(lastKind(i)).toBe('CreateToken');
        expect(lastInput(i)).toMatchObject({
          clientId: 'client-1',
          clientSecret: 'secret-1',
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: 'device-1',
        });
      }
    });

    it('treats expired_token as a terminal error', async () => {
      mockSend.mockRejectedValueOnce(ssoError('expired_token'));

      await expect(service.pollDeviceAuth(args)).rejects.toThrow(
        /expired/i,
      );
    });

    it('rethrows an unexpected SDK failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('boom'));

      await expect(service.pollDeviceAuth(args)).rejects.toThrow('boom');
    });
  });

  describe('listSsoAccounts', () => {
    it('paginates until nextToken is absent', async () => {
      mockSend
        .mockResolvedValueOnce({
          accountList: [{ accountId: '111', accountName: 'prod' }],
          nextToken: 'page-2',
        })
        .mockResolvedValueOnce({
          accountList: [{ accountId: '222', accountName: 'dev' }],
        });

      const accounts = await service.listSsoAccounts({
        region: 'us-east-1',
        accessToken: 'access-1',
      });

      expect(accounts).toEqual([
        { accountId: '111', accountName: 'prod', emailAddress: undefined },
        { accountId: '222', accountName: 'dev', emailAddress: undefined },
      ]);
      expect(lastKind(0)).toBe('ListAccounts');
      expect(lastInput(0)).toMatchObject({ accessToken: 'access-1', nextToken: undefined });
      expect(lastInput(1)).toMatchObject({ nextToken: 'page-2' });
    });
  });

  describe('listSsoRoles', () => {
    it('paginates until nextToken is absent', async () => {
      mockSend
        .mockResolvedValueOnce({
          roleList: [{ roleName: 'Admin', accountId: '111' }],
          nextToken: 'roles-2',
        })
        .mockResolvedValueOnce({
          roleList: [{ roleName: 'ReadOnly', accountId: '111' }],
        });

      const roles = await service.listSsoRoles({
        region: 'us-east-1',
        accessToken: 'access-1',
        accountId: '111',
      });

      expect(roles).toEqual([
        { roleName: 'Admin', accountId: '111' },
        { roleName: 'ReadOnly', accountId: '111' },
      ]);
      expect(lastKind(0)).toBe('ListAccountRoles');
      expect(lastInput(0)).toMatchObject({ accountId: '111', accessToken: 'access-1' });
      expect(lastInput(1)).toMatchObject({ nextToken: 'roles-2' });
    });
  });

  describe('resolveCredentials', () => {
    it('exchanges the refresh token with the SAME client, then fetches role credentials', async () => {
      mockSend
        .mockResolvedValueOnce({ accessToken: 'access-2', refreshToken: 'refresh-2' })
        .mockResolvedValueOnce({
          roleCredentials: {
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            sessionToken: 'session',
            expiration: 1_900_000_000_000,
          },
        });

      const result = await service.resolveCredentials({
        region: 'us-east-1',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        refreshToken: 'refresh-1',
        accountId: '111',
        roleName: 'Admin',
      });

      // Refresh grant used the persisted client — NOT a fresh RegisterClient.
      expect(lastKind(0)).toBe('CreateToken');
      expect(lastInput(0)).toMatchObject({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        grantType: 'refresh_token',
        refreshToken: 'refresh-1',
      });
      const kinds = mockSend.mock.calls.map((c) => (c[0] as SendInput).kind);
      expect(kinds).not.toContain('RegisterClient');

      // Role credentials requested for the exact account/role.
      expect(lastKind(1)).toBe('GetRoleCredentials');
      expect(lastInput(1)).toMatchObject({
        accountId: '111',
        roleName: 'Admin',
        accessToken: 'access-2',
      });

      expect(result.credentials).toEqual({
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        sessionToken: 'session',
        expiration: new Date(1_900_000_000_000),
      });
      expect(result.rotatedRefreshToken).toBe('refresh-2');
    });

    it('throws when GetRoleCredentials returns nothing', async () => {
      mockSend
        .mockResolvedValueOnce({ accessToken: 'access-2' })
        .mockResolvedValueOnce({ roleCredentials: undefined });

      await expect(
        service.resolveCredentials({
          region: 'us-east-1',
          clientId: 'client-1',
          clientSecret: 'secret-1',
          refreshToken: 'refresh-1',
          accountId: '111',
          roleName: 'Admin',
        }),
      ).rejects.toThrow(/no credentials/i);
    });
  });
});
