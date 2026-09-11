import { Injectable } from '@nestjs/common';
import {
  CreateTokenCommand,
  RegisterClientCommand,
  SSOOIDCClient,
  StartDeviceAuthorizationCommand,
} from '@aws-sdk/client-sso-oidc';
import {
  GetRoleCredentialsCommand,
  ListAccountRolesCommand,
  ListAccountsCommand,
  SSOClient,
} from '@aws-sdk/client-sso';
import type { SsoCredentialResolver } from '../connector.abstract';

const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const REFRESH_TOKEN_GRANT = 'refresh_token';
const REGISTERED_CLIENT_NAME = 'oasm-integration';
const REGISTERED_CLIENT_TYPE = 'public';
const CLIENT_SCOPES = ['sso:account:access'];

/** Payload returned by {@link AwsSsoService.startDeviceAuth}. */
export interface DeviceAuthStart {
  clientId: string;
  clientSecret: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  interval: number;
  expiresIn: number;
}

/** Result of one device-authorization poll. */
export type DeviceAuthPollResult =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | {
      status: 'authorized';
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
    };

/** An IAM Identity Center account the signed-in user can access. */
export interface SsoAccount {
  accountId: string;
  accountName?: string;
  emailAddress?: string;
}

/** A role available to the signed-in user within an account. */
export interface SsoRole {
  roleName: string;
  accountId?: string;
}

/**
 * Extracts the OAuth error code from a thrown AWS SDK exception.
 * The SSO-OIDC exceptions carry an `error` string (`authorization_pending`,
 * `slow_down`, `expired_token`, ...); fall back to the exception `name`.
 */
function sdkErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { error?: unknown; name?: unknown };
    if (typeof e.error === 'string') return e.error;
    if (typeof e.name === 'string') return e.name;
  }
  return '';
}

function blank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * IAM Identity Center (AWS SSO) device-authorization flow and credential
 * resolution.
 *
 * Binding rule: a refresh token is only accepted by the client that registered
 * it. `startDeviceAuth` therefore returns `clientId`/`clientSecret`, the caller
 * persists them with the refresh token, and `resolveCredentials` re-uses them —
 * it NEVER calls `RegisterClient`.
 */
@Injectable()
export class AwsSsoService implements SsoCredentialResolver {
  /**
   * Registers a public OIDC client and starts the device authorization flow.
   * Returns the registered client id/secret so the caller can persist them
   * alongside the resulting refresh token.
   */
  async startDeviceAuth(args: {
    region: string;
    startUrl: string;
  }): Promise<DeviceAuthStart> {
    if (blank(args.region)) {
      throw new Error('AWS SSO region is required');
    }
    if (blank(args.startUrl)) {
      throw new Error('AWS SSO start URL is required');
    }

    const client = new SSOOIDCClient({ region: args.region });

    const registered = await client.send(
      new RegisterClientCommand({
        clientName: REGISTERED_CLIENT_NAME,
        clientType: REGISTERED_CLIENT_TYPE,
        scopes: CLIENT_SCOPES,
        grantTypes: [DEVICE_CODE_GRANT, REFRESH_TOKEN_GRANT],
      }),
    );

    if (blank(registered.clientId) || blank(registered.clientSecret)) {
      throw new Error('AWS SSO RegisterClient did not return a client id/secret');
    }

    const device = await client.send(
      new StartDeviceAuthorizationCommand({
        clientId: registered.clientId,
        clientSecret: registered.clientSecret,
        startUrl: args.startUrl,
      }),
    );

    if (blank(device.deviceCode) || blank(device.userCode)) {
      throw new Error(
        'AWS SSO StartDeviceAuthorization did not return a device code',
      );
    }

    return {
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
      deviceCode: device.deviceCode,
      userCode: device.userCode,
      verificationUri: device.verificationUri ?? '',
      verificationUriComplete: device.verificationUriComplete,
      interval: device.interval ?? 5,
      expiresIn: device.expiresIn ?? 600,
    };
  }

  /**
   * Polls `CreateToken` for the device-code grant. `authorization_pending` and
   * `slow_down` are returned as statuses; `expired_token` (and any other
   * failure) is terminal.
   */
  async pollDeviceAuth(args: {
    region: string;
    clientId: string;
    clientSecret: string;
    deviceCode: string;
  }): Promise<DeviceAuthPollResult> {
    const client = new SSOOIDCClient({ region: args.region });

    try {
      const token = await client.send(
        new CreateTokenCommand({
          clientId: args.clientId,
          clientSecret: args.clientSecret,
          grantType: DEVICE_CODE_GRANT,
          deviceCode: args.deviceCode,
        }),
      );

      if (blank(token.accessToken)) {
        throw new Error('AWS SSO CreateToken did not return an access token');
      }

      return {
        status: 'authorized',
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresIn: token.expiresIn,
      };
    } catch (err: unknown) {
      const code = sdkErrorCode(err);
      if (code === 'authorization_pending' || code === 'AuthorizationPendingException') {
        return { status: 'pending' };
      }
      if (code === 'slow_down' || code === 'SlowDownException') {
        return { status: 'slow_down' };
      }
      if (code === 'expired_token' || code === 'ExpiredTokenException') {
        throw new Error(
          'AWS SSO device authorization expired; restart the connect flow',
        );
      }
      throw err;
    }
  }

  /** Lists every account the access token grants access to (paginated). */
  async listSsoAccounts(args: {
    region: string;
    accessToken: string;
  }): Promise<SsoAccount[]> {
    const client = new SSOClient({ region: args.region });
    const accounts: SsoAccount[] = [];
    let nextToken: string | undefined;

    do {
      const page = await client.send(
        new ListAccountsCommand({
          accessToken: args.accessToken,
          nextToken,
        }),
      );
      for (const account of page.accountList ?? []) {
        if (!account.accountId) continue;
        accounts.push({
          accountId: account.accountId,
          accountName: account.accountName,
          emailAddress: account.emailAddress,
        });
      }
      nextToken = page.nextToken;
    } while (nextToken);

    return accounts;
  }

  /** Lists every role available in an account (paginated). */
  async listSsoRoles(args: {
    region: string;
    accessToken: string;
    accountId: string;
  }): Promise<SsoRole[]> {
    const client = new SSOClient({ region: args.region });
    const roles: SsoRole[] = [];
    let nextToken: string | undefined;

    do {
      const page = await client.send(
        new ListAccountRolesCommand({
          accessToken: args.accessToken,
          accountId: args.accountId,
          nextToken,
        }),
      );
      for (const role of page.roleList ?? []) {
        if (!role.roleName) continue;
        roles.push({ roleName: role.roleName, accountId: role.accountId });
      }
      nextToken = page.nextToken;
    } while (nextToken);

    return roles;
  }

  /**
   * Exchanges a stored refresh token for short-lived role credentials.
   *
   * The same `clientId`/`clientSecret` that registered the refresh token MUST
   * be supplied — `RegisterClient` is deliberately never called here.
   */
  async resolveCredentials(args: {
    region: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accountId: string;
    roleName: string;
  }): Promise<{
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
      expiration?: Date;
    };
    rotatedRefreshToken?: string;
  }> {
    const oidc = new SSOOIDCClient({ region: args.region });

    const token = await oidc.send(
      new CreateTokenCommand({
        clientId: args.clientId,
        clientSecret: args.clientSecret,
        grantType: REFRESH_TOKEN_GRANT,
        refreshToken: args.refreshToken,
      }),
    );

    if (blank(token.accessToken)) {
      throw new Error('AWS SSO refresh_token exchange did not return an access token');
    }

    const sso = new SSOClient({ region: args.region });
    const result = await sso.send(
      new GetRoleCredentialsCommand({
        accountId: args.accountId,
        roleName: args.roleName,
        accessToken: token.accessToken,
      }),
    );

    const roleCredentials = result.roleCredentials;
    if (blank(roleCredentials?.accessKeyId) || blank(roleCredentials?.secretAccessKey)) {
      throw new Error('AWS SSO GetRoleCredentials returned no credentials');
    }

    return {
      credentials: {
        accessKeyId: roleCredentials.accessKeyId,
        secretAccessKey: roleCredentials.secretAccessKey,
        sessionToken: roleCredentials.sessionToken,
        expiration:
          typeof roleCredentials.expiration === 'number'
            ? new Date(roleCredentials.expiration)
            : undefined,
      },
      rotatedRefreshToken: token.refreshToken,
    };
  }
}
