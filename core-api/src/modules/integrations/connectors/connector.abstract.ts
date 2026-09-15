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
 * Base abstract class for all integration connectors.
 * Provides common shape that category-specific connectors extend.
 *
 * Concrete implementations should be registered per appType (e.g., Slack, Jira)
 * and implement the category-specific abstract methods below.
 */
export abstract class BaseConnector {
  /**
   * The integration category determines which primary action this connector supports.
   */
  abstract get category(): IntegrationType;

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
export abstract class NotificationConnector extends BaseConnector {
  override readonly category = IntegrationType.NOTIFICATION;

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
export abstract class CloudProviderConnector extends BaseConnector {
  override readonly category = IntegrationType.CLOUD_PROVIDER;

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
export abstract class TicketingConnector extends BaseConnector {
  override readonly category = IntegrationType.TICKETING;

  /**
   * Create a ticket in the external ticketing / issue-tracking system.
   *
   * @param config - Connector configuration including title, description, priority, etc.
   */
  abstract createTicket(config: ConnectorConfig): Promise<void>;
}
