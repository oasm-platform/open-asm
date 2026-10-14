import { TargetType } from '@/common/enums/enum';

/**
 * ExecuteJob inputs a connector receives for one asset. The wire format is a
 * flat string map (connector.proto `map<string, string> inputs`).
 *
 * - Host assets: `{ target }` — the hostname / IP, unchanged.
 * - Repository assets (GIT_ORG target): the repository contract of the SDK's
 *   `gitrepo` package — `repository` (https clone URL), `ref` (default
 *   branch), and `username` / `token` for private repositories.
 */
export type ConnectorInputs = Record<string, string>;

export interface RepositoryCredentials {
  username: string;
  token: string;
}

interface InputAsset {
  value: string;
  metadata?: Record<string, unknown> | null;
  target?: { type?: string } | null;
}

/** HTTP basic user each provider accepts alongside an access token. */
export function repositoryUsername(appType: string): string {
  return appType === 'gitlab' ? 'oauth2' : 'x-access-token';
}

export function isRepositoryAsset(asset: InputAsset): boolean {
  return asset.target?.type === TargetType.GIT_ORG;
}

/**
 * Builds the inputs of one connector job. Credentials are only attached to
 * repository assets, and only when resolved for this dispatch — they are
 * never stored on the job.
 */
export function buildConnectorInputs(
  asset: InputAsset,
  credentials?: RepositoryCredentials | null,
): ConnectorInputs {
  if (!isRepositoryAsset(asset)) {
    return { target: asset.value };
  }

  const meta = asset.metadata ?? {};
  const url = typeof meta.url === 'string' ? meta.url : `https://${asset.value}`;
  const inputs: ConnectorInputs = {
    repository: url,
    ref: typeof meta.defaultBranch === 'string' ? meta.defaultBranch : '',
  };
  if (credentials?.token) {
    inputs.username = credentials.username;
    inputs.token = credentials.token;
  }
  return inputs;
}
