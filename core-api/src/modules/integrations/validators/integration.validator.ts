import { encrypt, decrypt } from '@/common/utils/encryption.util';
import { BadRequestException } from '@nestjs/common';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { universalIntegrationSchema } from '../schemas';

/**
 * Sensitive config field names that should be masked in responses.
 * These keys match the `ui:widget: password` fields defined in the JSON schemas.
 */
const SENSITIVE_FIELDS = [
  'apiToken',
  'password',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
];

/**
 * Fields to inject into the config before validation.
 * The discriminating keys (app_type, category) come from the DTO top-level
 * but live inside `config` in the JSON Schema.
 */
const DISCRIMINATOR_FIELDS = ['app_type', 'category'];

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
 */
export function validateIntegrationConfig(args: {
  appType: string;
  category: string;
  config: Record<string, unknown>;
}): ValidationResult {
  const configWithDiscriminators = {
    ...args.config,
    app_type: args.appType,
    category: args.category,
  };

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
  const masked: Record<string, unknown> = { ...config };

  // Strip discriminator fields that were injected during validation/storage
  for (const field of DISCRIMINATOR_FIELDS) {
    delete masked[field];
  }

  for (const field of SENSITIVE_FIELDS) {
    if (field in masked && typeof masked[field] === 'string') {
      const value = masked[field];
      masked[field] = value.length <= 4 ? '****' : '****' + value.slice(-4);
    }
  }

  return masked;
}

/**
 * Encrypts sensitive fields in config before storage.
 */
export function encryptSensitiveConfigFields(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (field in result && typeof result[field] === 'string') {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

/**
 * Decrypts sensitive fields in config after retrieval.
 */
export function decryptSensitiveConfigFields(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (field in result && typeof result[field] === 'string') {
      try {
        result[field] = decrypt(result[field]);
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
  config: Record<string, unknown>;
}): void {
  const result = validateIntegrationConfig(args);
  if (!result.valid) {
    throw new BadRequestException(
      `Invalid integration configuration: ${result.errors.join('; ')}`,
    );
  }
}
