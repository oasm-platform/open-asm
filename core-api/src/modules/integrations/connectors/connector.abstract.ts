import { IntegrationType } from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import type { DataAdapterService } from '../../data-adapter/data-adapter.service';
import type { TargetsService } from '../../targets/targets.service';

/**
 * Generic configuration type for all connectors.
 * Matches the JSONB config stored on the Integration entity.
 */
export type ConnectorConfig = Record<string, unknown>;

/**
 * Counts produced by one cloud-provider asset sync.
 *
 * Deliberately has NO index signature: adding `[key: string]: unknown` makes
 * `interface SyncResult extends ConnectorSyncResult` fail with TS2430 (the
 * derived interface would then have to redeclare the inherited index
 * signature). Keep this a plain shape and extend it — never widen it.
 */
export interface ConnectorSyncResult {
  targetsCreated: number;
  assetsUpserted: number;
}

/**
 * Short-lived AWS session credentials (access-key based).
 */
export interface AwsSessionCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * Resolves short-lived credentials from a stored AWS SSO refresh token.
 * Implemented by the SSO service and injected into a connector at runtime.
 */
export interface SsoCredentialResolver {
  resolveCredentials(args: {
    region: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accountId: string;
    roleName: string;
  }): Promise<{
    credentials: AwsSessionCredentials;
    rotatedRefreshToken?: string;
  }>;
}

/**
 * Runtime config assembled by IntegrationSyncService and injected into a
 * cloud-provider connector. Services are dependency-injected at runtime — the
 * connector only knows their surface via `import type`, so there is no runtime
 * import of the service modules.
 */
export interface CloudProviderSyncConfig extends ConnectorConfig {
  workspaceId: string;
  integrationId: string;
  /** Test mode — fetch only, never write to the DB. */
  __dryRun?: boolean;
  /**
   * Stashed by syncAssets before returning so the caller
   * (IntegrationSyncService) can read the counts back without re-parsing the
   * connector result message.
   */
  __syncResult?: ConnectorSyncResult;
  /** Upper bound on a single sync; the connector stops starting new work past it. */
  maxSyncDurationMs?: number;
  targetsService: Pick<
    TargetsService,
    'findByWorkspaceAndValues' | 'createMultipleTargets'
  >;
  dataAdapterService: Pick<DataAdapterService, 'upsertAssetsByTargetId'>;
  actingUserContext: UserContextPayload;
  /** SSO credential resolver (AWS SSO method only). */
  ssoService?: SsoCredentialResolver;
  /** Persists an encrypted config patch (e.g. a rotated SSO refresh token). */
  persistConfigPatch?: (patch: Record<string, unknown>) => Promise<void>;
}

/**
 * A repository exposed by a SOURCE_CODE connector, normalised across
 * providers so the console can render GitHub and GitLab the same way.
 */
export interface SourceRepository {
  /** Provider-side id (stable across renames). */
  id: string;
  name: string;
  /** `owner/repo` (GitHub) or `group/subgroup/project` (GitLab). */
  fullName: string;
  /** Browser URL of the repository. */
  url: string;
  defaultBranch: string | null;
  private: boolean;
  archived: boolean;
  /** True when the repository is a fork of another one. */
  fork: boolean;
  updatedAt: string | null;
  /** Last push to any branch, when the provider reports it. */
  pushedAt: string | null;
}

export interface RepositoryQuery {
  search?: string;
  page: number;
  limit: number;
  /**
   * Restrict to one owner: a GitHub organization/user login or a GitLab
   * group/user path. Omitted → every repository the token can see.
   */
  owner?: string;
}

/**
 * A namespace that owns repositories and can become a GIT_ORG target: a
 * GitHub organization or user, a GitLab group or user.
 */
export interface SourceOrganization {
  /** Login (GitHub) or full path (GitLab) — what RepositoryQuery.owner takes. */
  path: string;
  /** Display name. */
  name: string;
  kind: 'organization' | 'user' | 'group';
  /** Browser URL of the namespace. */
  url: string;
  avatarUrl: string | null;
  /** Target value for this namespace: `<host>/<path>`, e.g. github.com/acme. */
  targetValue: string;
}

export interface RepositoryPage {
  data: SourceRepository[];
  page: number;
  limit: number;
  hasNextPage: boolean;
}

// ─── Capability contracts ───────────────────────────────────────────
// One interface per IntegrationType. A connector implements every
// capability its app declares — a multi-capability app (GitHub) is one class
// implementing several of these instead of one subclass per category.

/** {@link IntegrationType.NOTIFICATION} */
export interface NotificationCapable {
  push(config: ConnectorConfig): Promise<void>;
}

/** {@link IntegrationType.CLOUD_PROVIDER} */
export interface CloudProviderCapable {
  syncAssets(config: ConnectorConfig): Promise<unknown>;
}

/** {@link IntegrationType.TICKETING} */
export interface TicketingCapable {
  createTicket(config: ConnectorConfig): Promise<void>;
}

/** {@link IntegrationType.SOURCE_CODE} */
export interface SourceCodeCapable {
  listRepositories(
    config: ConnectorConfig,
    query: RepositoryQuery,
  ): Promise<RepositoryPage>;

  /** Namespaces the token can read: its own user plus orgs/groups. */
  listOrganizations(config: ConnectorConfig): Promise<SourceOrganization[]>;
}

/**
 * Base abstract class for all integration connectors.
 *
 * Concrete implementations are registered per appType (e.g., Slack, GitHub)
 * and implement one capability interface per capability their app declares.
 * Single-capability connectors extend one of the category classes below.
 */
export abstract class BaseConnector {
  /**
   * Optional credential check used by "Test integration" for capabilities
   * that have no side-effect-free action of their own (TICKETING must not
   * open a real ticket, SOURCE_CODE has nothing to push). `capability` narrows
   * the check (e.g. GitHub verifies write access to the issue repository only
   * when TICKETING is tested); undefined means "the connection itself".
   */
  testConnection?(
    config: ConnectorConfig,
    capability?: IntegrationType,
  ): Promise<void>;

  /**
   * Optional lifecycle hook called before the connector executes its action.
   * Subclasses can override to add pre-execution validation or setup.
   */
  async beforeExecute(_config: ConnectorConfig): Promise<void> {
    // no-op by default
  }

  /**
   * Optional lifecycle hook called after the connector executes its action.
   * Subclasses can override to add post-execution teardown or logging.
   */
  async afterExecute(_config: ConnectorConfig): Promise<void> {
    // no-op by default
  }
}

/**
 * Abstract class for NOTIFICATION integrations.
 *
 * Categories covered: {@link IntegrationType.NOTIFICATION}
 * App types: Slack, Telegram, Webhook, etc.
 *
 * @example
 * ```ts
 * export class SlackConnector extends NotificationConnector {
 *   async push(config: ConnectorConfig): Promise<void> {
 *     // send message via Slack API
 *   }
 * }
 * ```
 */
export abstract class NotificationConnector
  extends BaseConnector
  implements NotificationCapable
{
  readonly category = IntegrationType.NOTIFICATION;

  /**
   * Push a notification payload to the external service.
   *
   * @param config - Connector configuration including destination, message content, etc.
   */
  abstract push(config: ConnectorConfig): Promise<void>;
}

/**
 * Abstract class for CLOUD_PROVIDER integrations.
 *
 * Categories covered: {@link IntegrationType.CLOUD_PROVIDER}
 * App types: Cloudflare, AWS, GCP, etc.
 *
 * @example
 * ```ts
 * export class CloudflareConnector extends CloudProviderConnector {
 *   async syncAssets(config: ConnectorConfig): Promise<void> {
 *     // fetch and sync cloud resources
 *   }
 * }
 * ```
 */
export abstract class CloudProviderConnector
  extends BaseConnector
  implements CloudProviderCapable
{
  readonly category = IntegrationType.CLOUD_PROVIDER;

  /**
   * Synchronise assets from the cloud provider into the platform.
   *
   * Implementations may return richer results (e.g. sync counts); the factory
   * only awaits the promise, so the return type stays loose.
   *
   * @param config - Connector configuration including API credentials, filters, etc.
   */
  abstract syncAssets(config: ConnectorConfig): Promise<unknown>;
}

/**
 * Abstract class for TICKETING integrations.
 *
 * Categories covered: {@link IntegrationType.TICKETING}
 * App types: Jira, Linear, GitHub Issues, etc.
 *
 * @example
 * ```ts
 * export class JiraConnector extends TicketingConnector {
 *   async createTicket(config: ConnectorConfig): Promise<void> {
 *     // create issue via Jira REST API
 *   }
 * }
 * ```
 */
export abstract class TicketingConnector
  extends BaseConnector
  implements TicketingCapable
{
  readonly category = IntegrationType.TICKETING;

  /**
   * Create a ticket in the external ticketing / issue-tracking system.
   *
   * @param config - Connector configuration including title, description, priority, etc.
   */
  abstract createTicket(config: ConnectorConfig): Promise<void>;
}
