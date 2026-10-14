import { IntegrationType } from '@/common/enums/enum';
import { BadRequestException, Logger } from '@nestjs/common';
import type {
  BaseConnector,
  ConnectorConfig,
  SourceCodeCapable,
} from './connector.abstract';
import { getConnectorClass } from './connector.registry';

/**
 * Response from a connector test execution.
 */
export interface ConnectorTestResult {
  success: boolean;
  /** The capability that was exercised (kept as `category` for API compat). */
  category: string;
  appType: string;
  message: string;
  timestamp: string;
  error?: string;
}

/**
 * Map of capability → the method a connector implements for it.
 *
 * This is the SINGLE data-driven dispatch point for capabilities that run as
 * a fire-and-forget action. SOURCE_CODE is absent on purpose: listing
 * repositories returns data and takes a query, so it is resolved through
 * {@link resolveSourceCodeConnector} instead of being "run".
 */
const CAPABILITY_METHOD_MAP: Partial<Record<IntegrationType, string>> = {
  [IntegrationType.NOTIFICATION]: 'push',
  [IntegrationType.CLOUD_PROVIDER]: 'syncAssets',
  [IntegrationType.TICKETING]: 'createTicket',
};

const logger = new Logger('ConnectorFactory');

function result(
  appType: string,
  capability: string,
  fields: Pick<ConnectorTestResult, 'success' | 'message' | 'error'>,
): ConnectorTestResult {
  return {
    category: capability,
    appType,
    timestamp: new Date().toISOString(),
    ...fields,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown connector error';
}

/**
 * Resolve the connector class for the given appType and dispatch the method
 * that implements `capability`.
 *
 * Hook lifecycle: beforeExecute → <capability method> → afterExecute
 *
 * @param appType    - Integration app type (e.g. 'telegram', 'github')
 * @param capability - The capability to exercise (e.g. IntegrationType.NOTIFICATION).
 *                     For single-capability apps this is the stored category.
 * @param config     - Merged config (stored integration config + runtime params)
 * @returns Test result indicating success or failure
 */
export async function runConnector(
  appType: string,
  capability: string,
  config: ConnectorConfig,
): Promise<ConnectorTestResult> {
  // 1. Resolve connector class by appType (data-driven, no switch)
  const ConnectorClass = getConnectorClass(appType);
  if (!ConnectorClass) {
    return result(appType, capability, {
      success: false,
      message: `No connector registered for appType "${appType}"`,
    });
  }

  // 2. Resolve method name by capability (data-driven, no switch)
  const methodName = CAPABILITY_METHOD_MAP[capability as IntegrationType];
  if (!methodName) {
    return result(appType, capability, {
      success: false,
      message: `No method mapped for capability "${capability}". Supported: ${Object.keys(CAPABILITY_METHOD_MAP).join(', ')}`,
    });
  }

  // 3. Instantiate connector (plain class, no DI needed)
  const connector: BaseConnector = new ConnectorClass();
  const method = (
    connector as unknown as Record<
      string,
      ((cfg: ConnectorConfig) => Promise<void>) | undefined
    >
  )[methodName];
  if (typeof method !== 'function') {
    return result(appType, capability, {
      success: false,
      message: `Connector "${appType}" does not implement ${methodName}() for capability "${capability}"`,
    });
  }

  try {
    // 4. Execute lifecycle: beforeExecute → method → afterExecute
    logger.log(
      `Executing ${appType}.${methodName}() for capability ${capability}`,
    );

    await connector.beforeExecute?.(config);
    await method.call(connector, config);
    await connector.afterExecute?.(config);

    return result(appType, capability, {
      success: true,
      message: `${appType}.${methodName}() completed successfully`,
    });
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`Connector test failed for ${appType}: ${message}`);
    return result(appType, capability, {
      success: false,
      message: `Connector test failed`,
      error: message,
    });
  }
}

/**
 * Side-effect-free credential check via `connector.testConnection()`. Used
 * to test capabilities whose action would touch the outside world (TICKETING
 * would open a real ticket) or that have no action at all (SOURCE_CODE).
 *
 * @param capability - Narrows the check; undefined tests the connection only.
 */
export async function testConnectorConnection(
  appType: string,
  capability: string | undefined,
  config: ConnectorConfig,
): Promise<ConnectorTestResult> {
  const label = capability ?? 'CONNECTION';
  const ConnectorClass = getConnectorClass(appType);
  if (!ConnectorClass) {
    return result(appType, label, {
      success: false,
      message: `No connector registered for appType "${appType}"`,
    });
  }

  const connector: BaseConnector = new ConnectorClass();
  if (typeof connector.testConnection !== 'function') {
    return result(appType, label, {
      success: false,
      message: `Connector "${appType}" does not support connection tests`,
    });
  }

  try {
    await connector.testConnection(
      config,
      capability as IntegrationType | undefined,
    );
    return result(appType, label, {
      success: true,
      message: capability
        ? `${appType} ${capability.toLowerCase()} access verified`
        : `${appType} connection verified`,
    });
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`Connection test failed for ${appType}: ${message}`);
    return result(appType, label, {
      success: false,
      message: 'Connector test failed',
      error: message,
    });
  }
}

/**
 * Returns the connector for `appType` typed as a SOURCE_CODE provider, or
 * throws when the app has no such implementation.
 */
export function resolveSourceCodeConnector(appType: string): SourceCodeCapable {
  const ConnectorClass = getConnectorClass(appType);
  const connector = ConnectorClass ? new ConnectorClass() : undefined;
  if (
    !connector ||
    typeof (connector as Partial<SourceCodeCapable>).listRepositories !==
      'function'
  ) {
    throw new BadRequestException(
      `Integration app "${appType}" cannot list repositories`,
    );
  }
  return connector as unknown as SourceCodeCapable;
}
