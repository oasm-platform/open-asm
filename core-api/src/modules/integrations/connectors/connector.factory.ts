import { IntegrationType } from '@/common/enums/enum';
import { Logger } from '@nestjs/common';
import type { BaseConnector, ConnectorConfig } from './connector.abstract';
import { getConnectorClass } from './connector.registry';

/**
 * Response from a connector test execution.
 */
export interface ConnectorTestResult {
  success: boolean;
  category: string;
  appType: string;
  message: string;
  timestamp: string;
  error?: string;
}

/**
 * Map of IntegrationType enum value → the abstract method name on BaseConnector.
 *
 * This is the SINGLE data-driven dispatch point — adding a new category only
 * requires an entry here plus a new abstract subclass. No if/else chains.
 */
const CATEGORY_METHOD_MAP: Record<string, string> = {
  [IntegrationType.NOTIFICATION]: 'push',
  [IntegrationType.CLOUD_PROVIDER]: 'syncAssets',
  [IntegrationType.TICKETING]: 'createTicket',
};

const logger = new Logger('ConnectorFactory');

/**
 * Resolve the connector class for the given appType and dispatch the correct
 * abstract method based on the integration's category.
 *
 * Hook lifecycle: beforeExecute → <category method> → afterExecute
 *
 * @param appType  - Integration app type (e.g. 'telegram', 'slack', 'webhook')
 * @param category - Integration category enum value (e.g. IntegrationType.NOTIFICATION)
 * @param config   - Merged config (stored integration config + runtime test params)
 * @returns Test result indicating success or failure
 */
export async function runConnector(
  appType: string,
  category: string,
  config: ConnectorConfig,
): Promise<ConnectorTestResult> {
  // 1. Resolve connector class by appType (data-driven, no switch)
  const ConnectorClass = getConnectorClass(appType);
  if (!ConnectorClass) {
    return {
      success: false,
      category,
      appType,
      message: `No connector registered for appType "${appType}"`,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Resolve method name by category (data-driven, no switch)
  const methodName = CATEGORY_METHOD_MAP[category];
  if (!methodName) {
    return {
      success: false,
      category,
      appType,
      message: `No method mapped for category "${category}". Supported categories: ${Object.values(IntegrationType).join(', ')}`,
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Instantiate connector (plain class, no DI needed)
  const connector: BaseConnector = new ConnectorClass();

  try {
    // 4. Execute lifecycle: beforeExecute → method → afterExecute
    logger.log(
      `Executing ${appType}.${String(methodName)}() for category ${category}`,
    );

    await connector.beforeExecute?.(config);
    await (
      connector as unknown as Record<
        string,
        (cfg: ConnectorConfig) => Promise<void>
      >
    )[methodName](config);
    await connector.afterExecute?.(config);

    return {
      success: true,
      category,
      appType,
      message: `${appType}.${String(methodName)}() completed successfully`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown connector error';

    logger.error(`Connector test failed for ${appType}: ${errorMessage}`);

    return {
      success: false,
      category,
      appType,
      message: `Connector test failed`,
      timestamp: new Date().toISOString(),
      error: errorMessage,
    };
  }
}
