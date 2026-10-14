import { encrypt } from '@/common/utils/encryption.util';
import {
  decryptWithDEK,
  encryptWithDEK,
} from '@/common/utils/workspace-encryption.util';
import { BadRequestException } from '@nestjs/common';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { isMultiCapabilityApp } from '../capabilities';
import { universalIntegrationSchema } from '../schemas';

/**
 * Dynamically extracts sensitive field names from the integration JSON schemas.
 * Any property with `ui:widget: password` in its schema definition is treated
 * as sensitive — its value is encrypted at rest and masked in API responses.
 */
function getSensitiveFieldsFromSchema(): string[] {
  const fields = new Set<string>();
  const oneOf = (universalIntegrationSchema as Record<string, unknown>)
    .oneOf as Record<string, unknown>[] | undefined;
  if (!oneOf) return [];

  for (const subSchema of oneOf) {
    const properties = subSchema.properties as
      | Record<string, unknown>
      | undefined;
    if (!properties) continue;

    for (const [key, value] of Object.entries(properties)) {
      if (
        value &&
        typeof value === 'object' &&
        (value as Record<string, unknown>)['ui:widget'] === 'password'
      ) {
        fields.add(key);
      }
    }
  }

  return [...fields];
}

const SENSITIVE_FIELDS = getSensitiveFieldsFromSchema();

/**
 * Fields to inject into the config before validation.
 * The discriminating keys (app_type, category, capabilities) come from the DTO
 * top-level / entity columns but live inside `config` in the JSON Schema.
 * They are never persisted inside `config`.
 */
const DISCRIMINATOR_FIELDS = ['app_type', 'category', 'capabilities'];

/** Drops the injected discriminator keys so they never land in stored config. */
export function omitDiscriminatorFields(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of DISCRIMINATOR_FIELDS) {
    delete result[field];
  }
  return result;
}

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const validateFn = ajv.compile(universalIntegrationSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the integration config against the universal JSON Schema.
 * Injects app_type + category from the DTO into config before validation
 * so the oneOf discriminated union can select the correct sub-schema.
 *
 * `capabilities` is injected ONLY for multi-capability apps: their schemas
 * declare it (and use it in `if/then` for capability-scoped required fields),
 * while legacy schemas are `additionalProperties: false` without it and must
 * keep validating exactly as before.
 */
export function validateIntegrationConfig(args: {
  appType: string;
  category: string;
  capabilities?: string[];
  config: Record<string, unknown>;
}): ValidationResult {
  const configWithDiscriminators: Record<string, unknown> = {
    ...omitDiscriminatorFields(args.config),
    app_type: args.appType,
    category: args.category,
  };
  if (isMultiCapabilityApp(args.appType)) {
    configWithDiscriminators.capabilities = args.capabilities ?? [
      args.category,
    ];
  }

  const valid = validateFn(configWithDiscriminators);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validateFn.errors ?? []).map((err) => {
    const instancePath = err.instancePath ? `${err.instancePath}: ` : '';
    return `${instancePath}${err.message ?? 'Validation error'}`;
  });

  return { valid: false, errors };
}

/**
 * Masks sensitive fields in the config for safe return in API responses.
 * Replaces values with a fixed-length mask, preserving only the last 4 chars.
 */
export function maskSensitiveConfigFields(
  config: Record<string, unknown>,
): Record<string, unknown> {
  // Strip discriminator fields that were injected during validation/storage
  const masked = omitDiscriminatorFields(config);

  for (const field of SENSITIVE_FIELDS) {
    if (field in masked && typeof masked[field] === 'string') {
      masked[field] = maskSecret(masked[field]);
    }
  }

  return masked;
}

function maskSecret(value: string): string {
  return value.length <= 4 ? '****' : '****' + value.slice(-4);
}

/**
 * The console's edit form round-trips the MASKED config it was given, so an
 * untouched secret arrives as `****abcd`. Storing that verbatim would
 * overwrite the real token with its mask. Any sensitive field whose incoming
 * value is exactly the mask of the stored secret is restored to the stored
 * secret; a genuinely new value is kept.
 *
 * @param stored - Decrypted stored config.
 */
export function restoreMaskedSecrets(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...incoming };
  for (const field of SENSITIVE_FIELDS) {
    const next = result[field];
    const previous = stored[field];
    if (
      typeof next === 'string' &&
      typeof previous === 'string' &&
      next === maskSecret(previous)
    ) {
      result[field] = previous;
    }
  }
  return result;
}

/**
 * Encrypts sensitive fields in config before storage.
 * @param dek - Workspace DEK (cleartext) or null for pre-envelope-encryption workspaces
 */
export function encryptSensitiveConfigFields(
  config: Record<string, unknown>,
  dek: Buffer | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (field in result && typeof result[field] === 'string') {
      const val = result[field];
      result[field] = dek ? encryptWithDEK(val, dek) : encrypt(val);
    }
  }
  return result;
}

/**
 * Decrypts sensitive fields in config after retrieval.
 * Fallback chain: DEK → KEK → plain text (backward compatible).
 * @param dek - Workspace DEK (cleartext) or null for pre-envelope-encryption workspaces
 */
export function decryptSensitiveConfigFields(
  config: Record<string, unknown>,
  dek: Buffer | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (field in result && typeof result[field] === 'string') {
      try {
        result[field] = decryptWithDEK(result[field], dek);
      } catch {
        // Value was not encrypted (plain text stored in earlier versions)
      }
    }
  }
  return result;
}

/**
 * Convenience function: validates config and throws BadRequestException on failure.
 */
export function validateConfigOrThrow(args: {
  appType: string;
  category: string;
  capabilities?: string[];
  config: Record<string, unknown>;
}): void {
  const result = validateIntegrationConfig(args);
  if (!result.valid) {
    throw new BadRequestException(
      `Invalid integration configuration: ${result.errors.join('; ')}`,
    );
  }
}
