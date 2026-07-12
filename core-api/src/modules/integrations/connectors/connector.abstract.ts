import { IntegrationType } from '@/common/enums/enum';

/**
 * Generic configuration type for all connectors.
 * Matches the JSONB config stored on the Integration entity.
 */
export type ConnectorConfig = Record<string, unknown>;

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
   * @param config - Connector configuration including API credentials, filters, etc.
   */
  abstract syncAssets(config: ConnectorConfig): Promise<void>;
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
