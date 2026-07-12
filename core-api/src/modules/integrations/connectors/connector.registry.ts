import type { BaseConnector } from './connector.abstract';

/**
 * Map of appType → Connector constructor.
 * Built by scanning every schema that declares a `connector` field.
 */
const registry = new Map<string, new () => BaseConnector>();

/**
 * Register a connector class for a given appType.
 * Called from each schema file at import time.
 */
export function registerConnector(
  appType: string,
  ctor: new () => BaseConnector,
): void {
  if (registry.has(appType)) {
    // Duplicate registrations are a programming error — but we allow
    // the last registration to win (e.g., during hot-reload).
    return;
  }
  registry.set(appType, ctor);
}

/**
 * Retrieve the connector constructor for a given appType.
 */
export function getConnectorClass(
  appType: string,
): (new () => BaseConnector) | undefined {
  return registry.get(appType);
}
