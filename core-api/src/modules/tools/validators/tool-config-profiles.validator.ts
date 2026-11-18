
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import type { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import { InvalidInputError } from '@/common/errors/domain.errors';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// Compile-on-demand caches keyed by toolName.
const compiledCache = new Map<string, ReturnType<typeof ajv.compile>>();
const partialCache = new Map<string, ReturnType<typeof ajv.compile>>();

/**
 * Clears the compiled validator caches.
 * Exported for testing only — production code never needs this.
 */
export function _resetValidatorCache(): void {
  compiledCache.clear();
  partialCache.clear();
}

/**
 * Returns a compiled AJV validator for the given tool's effective schema.
 * Cached after first compile — subsequent calls reuse the cached function.
 * `partial` drops the top-level `required`, for a config that is merged over
 * a profile which supplies the rest.
 */
function getValidatorFor(
  registryService: ConnectorRegistryService,
  toolName: string,
  partial = false,
) {
  const cache = partial ? partialCache : compiledCache;
  const cached = cache.get(toolName);
  if (cached) return cached;

  const entry = registryService.getConnector(toolName);
  if (!entry) {
    throw new InvalidInputError(
      `Unknown tool "${toolName}" — cannot validate config`,
    );
  }

  const schema = entry.configSchema;
  if (!schema) {
    throw new InvalidInputError(
      `Tool "${toolName}" has no config schema or inputs schema -- cannot validate config`,
    );
  }

  const validate = ajv.compile(partial ? { ...schema, required: [] } : schema);
  cache.set(toolName, validate);
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
  validateOrThrow(registryService, toolName, config, false);
}

/**
 * Like validateProfileOrThrow, but required fields may be missing: for an
 * inline workflow-step config that is merged over a config profile.
 */
export function validatePartialConfigOrThrow(
  registryService: ConnectorRegistryService,
  toolName: string,
  config: Record<string, unknown>,
): void {
  validateOrThrow(registryService, toolName, config, true);
}

function validateOrThrow(
  registryService: ConnectorRegistryService,
  toolName: string,
  config: Record<string, unknown>,
  partial: boolean,
): void {
  const validate = getValidatorFor(registryService, toolName, partial);
  const valid = validate(config);

  if (!valid) {
    const errors = (validate.errors ?? []).map((err) => {
      const path = err.instancePath ? err.instancePath : '/';
      return `${path}: ${err.message ?? 'invalid value'}`;
    });
    throw new InvalidInputError(
      `Invalid config for tool "${toolName}": ${errors.join('; ')}`,
    );
  }
}
