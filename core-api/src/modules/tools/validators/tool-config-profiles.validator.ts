import { BadRequestException } from '@nestjs/common';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import type { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// Compile-on-demand cache keyed by toolName.
const compiledCache = new Map<string, ReturnType<typeof ajv.compile>>();

/**
 * Clears the compiled validator cache.
 * Exported for testing only — production code never needs this.
 */
export function _resetValidatorCache(): void {
  compiledCache.clear();
}

/**
 * Returns a compiled AJV validator for the given tool's effective schema.
 * Falls back to inputsSchema when configSchema is absent.
 * Cached after first compile — subsequent calls reuse the cached function.
 */
function getValidatorFor(
  registryService: ConnectorRegistryService,
  toolName: string,
) {
  const cached = compiledCache.get(toolName);
  if (cached) return cached;

  const entry = registryService.getConnector(toolName);
  if (!entry) {
    throw new BadRequestException(
      `Unknown tool "${toolName}" — cannot validate config`,
    );
  }

  // Fallback: configSchema ?? inputsSchema
  const schema = entry.configSchema ?? entry.inputsSchema;
  if (!schema) {
    throw new BadRequestException(
      `Tool "${toolName}" has no config schema or inputs schema -- cannot validate config`,
    );
  }

  const validate = ajv.compile(schema);
  compiledCache.set(toolName, validate);
  return validate;
}

/**
 * Validates a profile config against the tool's registry configSchema.
 * Throws BadRequestException with Ajv error paths on failure.
 *
 * Exported for direct use by the profiles service.
 */
export function validateProfileOrThrow(
  registryService: ConnectorRegistryService,
  toolName: string,
  config: Record<string, unknown>,
): void {
  const validate = getValidatorFor(registryService, toolName);
  const valid = validate(config);

  if (!valid) {
    const errors = (validate.errors ?? []).map((err) => {
      const path = err.instancePath ? err.instancePath : '/';
      return `${path}: ${err.message ?? 'invalid value'}`;
    });
    throw new BadRequestException(
      `Invalid config for tool "${toolName}": ${errors.join('; ')}`,
    );
  }
}
