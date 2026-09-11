import {
  fromTemporaryCredentials,
  fromWebToken,
} from '@aws-sdk/credential-providers';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { GetCallerIdentityCommandOutput } from '@aws-sdk/client-sts';
import {
  ListAccountsCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import type { AwsSessionCredentials } from '../connector.abstract';
import type { SsoCredentialResolver } from '../connector.abstract';

/**
 * The five credential strategies an AWS integration can use.
 */
export type AwsConnectionMethod =
  | 'accessKey'
  | 'assumeRole'
  | 'crossAccountRole'
  | 'workloadIdentity'
  | 'sso';

/**
 * Raw integration config consumed by {@link resolveAwsCredentials}.
 *
 * Fields are method-scoped: only the subset relevant to `connectionMethod` is
 * read. All are optional because a single JSONB config shape backs every method
 * — required-field enforcement happens per-method at the top of the resolver.
 */
export interface AwsCredentialConfig {
  connectionMethod: AwsConnectionMethod;
  /** Single region; used when `regions` is absent/empty. */
  region: string;
  /** Optional region allow-list; `regions[0]` wins over `region` when present. */
  regions?: string[];
  /** Static / base credentials. */
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  /** assumeRole + crossAccountRole + workloadIdentity role to assume. */
  roleArn?: string;
  /** assumeRole + crossAccountRole external id (required). */
  externalId?: string;
  /** Assumed-role session name; defaults to `oasm-inventory`. */
  roleSessionName?: string;
  /** workloadIdentity OAuth/OIDC token (required). */
  webIdentityToken?: string;
  /** Injected SSO resolver — the only dependency-injected service here. */
  ssoService?: SsoCredentialResolver;
  /** SSO client credentials + refresh token. */
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** SSO target account + role (distinct from the loop account id). */
  accountId?: string;
  roleName?: string;
}

/** Credential provider returned by `fromTemporaryCredentials`/`fromWebToken`. */
export type AwsCredentialProvider = ReturnType<typeof fromTemporaryCredentials>;

/**
 * What a client's `credentials` field accepts: either a static identity object
 * (SDK v3 accepts this directly) or a lazy async provider.
 */
export type AwsResolvedCredentials =
  | AwsSessionCredentials
  | AwsCredentialProvider;

/** Result of credential resolution for one AWS principal/region. */
export interface ResolveAwsCredentialsResult {
  credentials: AwsResolvedCredentials;
  region: string;
  /** Present only for SSO when the refresh token was rotated by the exchange. */
  rotatedRefreshToken?: string;
}

/** An ACTIVE account returned by Organizations `ListAccounts`. */
export interface OrganizationAccount {
  accountId: string;
  name?: string;
  email?: string;
}

const DEFAULT_ROLE_SESSION_NAME = 'oasm-inventory';
const DEFAULT_ORGANIZATIONS_REGION = 'us-east-1';

function blank(value: string | undefined): value is undefined {
  return value === undefined || value.trim().length === 0;
}

function required(value: string | undefined, message: string): string {
  if (blank(value)) {
    throw new Error(message);
  }
  return value;
}

function resolveRegion(config: AwsCredentialConfig): string {
  return required(config.regions?.[0] || config.region, 'AWS region is required');
}

/**
 * Asserts the base access-key pair is present. Never falls back to the default
 * credential chain — a missing base credential is a config error.
 */
function requireBaseCredentials(
  config: AwsCredentialConfig,
  method: string,
): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
  return {
    accessKeyId: required(
      config.accessKeyId,
      `${method} requires base credentials (accessKeyId + secretAccessKey)`,
    ),
    secretAccessKey: required(
      config.secretAccessKey,
      `${method} requires base credentials (accessKeyId + secretAccessKey)`,
    ),
    ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
  };
}

/**
 * Builds an `AssumeRole` provider from explicit base credentials.
 * `externalId` and base creds are mandatory; `{accountId}` placeholders in the
 * role ARN are substituted from the loop-supplied `accountId`.
 */
function resolveAssumeRole(
  config: AwsCredentialConfig,
  accountId: string | undefined,
  method: 'assumeRole' | 'crossAccountRole',
): AwsCredentialProvider {
  const masterCredentials = requireBaseCredentials(config, method);
  const externalId = required(config.externalId, `${method} requires externalId`);
  const roleArnTemplate = required(config.roleArn, `${method} requires roleArn`);
  const roleArn =
    method === 'assumeRole'
      ? roleArnTemplate.replace(
          '{accountId}',
          required(accountId, 'assumeRole requires an accountId'),
        )
      : roleArnTemplate;

  return fromTemporaryCredentials({
    masterCredentials,
    params: {
      RoleArn: roleArn,
      RoleSessionName: config.roleSessionName ?? DEFAULT_ROLE_SESSION_NAME,
      ExternalId: externalId,
      DurationSeconds: 3600,
    },
  });
}

/**
 * Resolves AWS credentials for the integration's `connectionMethod`.
 *
 * @param config - method-scoped credential config (never logged).
 * @param accountId - the multi-account loop's account id; only `assumeRole`
 *   reads it. Other methods ignore it.
 */
export async function resolveAwsCredentials(
  config: AwsCredentialConfig,
  accountId?: string,
): Promise<ResolveAwsCredentialsResult> {
  const region = resolveRegion(config);

  switch (config.connectionMethod) {
    case 'accessKey': {
      const credentials: AwsSessionCredentials = {
        ...requireBaseCredentials(config, 'accessKey'),
      };
      return { credentials, region };
    }

    case 'assumeRole':
    case 'crossAccountRole': {
      return {
        credentials: resolveAssumeRole(config, accountId, config.connectionMethod),
        region,
      };
    }

    case 'workloadIdentity': {
      return {
        credentials: fromWebToken({
          roleArn: required(config.roleArn, 'workloadIdentity requires roleArn'),
          webIdentityToken: required(
            config.webIdentityToken,
            'workloadIdentity requires webIdentityToken',
          ),
          roleSessionName: config.roleSessionName ?? DEFAULT_ROLE_SESSION_NAME,
        }),
        region,
      };
    }

    case 'sso': {
      if (!config.ssoService) {
        throw new Error('sso connector requires ssoService');
      }
      // NOTE: use config.accountId/config.roleName (the SSO target account) —
      // the `accountId` function parameter is the multi-account loop's id and
      // is deliberately ignored here.
      const { credentials, rotatedRefreshToken } =
        await config.ssoService.resolveCredentials({
          region,
          clientId: config.clientId ?? '',
          clientSecret: config.clientSecret ?? '',
          refreshToken: config.refreshToken ?? '',
          accountId: config.accountId ?? '',
          roleName: config.roleName ?? '',
        });
      return { credentials, region, rotatedRefreshToken };
    }

    default: {
      const unreachable: never = config.connectionMethod;
      throw new Error(`Unsupported AWS connection method: ${String(unreachable)}`);
    }
  }
}

/**
 * Lists every ACTIVE account in the AWS Organization, paginating until
 * `NextToken` is null. Inactive/suspended accounts are filtered out.
 */
export async function listOrganizationAccounts(
  credentials: AwsResolvedCredentials,
  region: string = DEFAULT_ORGANIZATIONS_REGION,
): Promise<OrganizationAccount[]> {
  const client = new OrganizationsClient({ region, credentials });
  const accounts: OrganizationAccount[] = [];
  let nextToken: string | undefined;

  do {
    const page = await client.send(
      new ListAccountsCommand({ NextToken: nextToken }),
    );
    for (const account of page.Accounts ?? []) {
      if (account.State !== 'ACTIVE' || blank(account.Id)) continue;
      accounts.push({
        accountId: account.Id,
        name: account.Name,
        email: account.Email,
      });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return accounts;
}

/** Calls STS `GetCallerIdentity` with the supplied credentials. */
export async function getCallerIdentity(
  credentials: AwsResolvedCredentials,
  region: string = DEFAULT_ORGANIZATIONS_REGION,
): Promise<GetCallerIdentityCommandOutput> {
  const client = new STSClient({ region, credentials });
  return client.send(new GetCallerIdentityCommand({}));
}
