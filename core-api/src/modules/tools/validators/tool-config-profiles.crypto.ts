import { encrypt } from '@/common/utils/encryption.util';
import {
  decryptWithDEK,
  encryptWithDEK,
} from '@/common/utils/workspace-encryption.util';

/**
 * Scans a JSON Schema for properties marked with `"ui:widget": "password"`.
 * Returns the list of property names that are sensitive (encrypted at rest,
 * masked in API responses).
 *
 * This is a generalized version of integrations' getSensitiveFieldsFromSchema(),
 * accepting any schema instead of a hardcoded oneOf.
 */
export function getSensitiveFields(
  schema: Record<string, unknown> | undefined,
): string[] {
  if (!schema) return [];
  const fields = new Set<string>();

  const properties = schema.properties as
    | Record<string, unknown>
    | undefined;
  if (!properties) return [];

  for (const [key, value] of Object.entries(properties)) {
    if (
      value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)['ui:widget'] === 'password'
    ) {
      fields.add(key);
    }
  }

  // Also scan oneOf/anyOf sub-schemas (integrations-style)
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const branches = schema[keyword] as
      | Record<string, unknown>[]
      | undefined;
    if (!Array.isArray(branches)) continue;
    for (const sub of branches) {
      const props = sub.properties as Record<string, unknown> | undefined;
      if (!props) continue;
      for (const [key, value] of Object.entries(props)) {
        if (
          value &&
          typeof value === 'object' &&
          (value as Record<string, unknown>)['ui:widget'] === 'password'
        ) {
          fields.add(key);
        }
      }
    }
  }

  return [...fields];
}

/**
 * Encrypts sensitive fields in config before storage.
 * Non-sensitive values are passed through unchanged.
 * Uses workspace DEK when available, falls back to KEK.
 */
export function encryptProfile(
  config: Record<string, unknown>,
  sensitiveFields: string[],
  dek: Buffer | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };
  for (const field of sensitiveFields) {
    if (field in result && typeof result[field] === 'string') {
      const val = result[field];
      result[field] = dek ? encryptWithDEK(val, dek) : encrypt(val);
    }
  }
  return result;
}

/**
 * Decrypts sensitive fields after retrieval.
 * Fallback chain: DEK → KEK → plain text (backward compatible).
 */
export function decryptProfile(
  encryptedConfig: Record<string, unknown>,
  sensitiveFields: string[],
  dek: Buffer | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...encryptedConfig };
  for (const field of sensitiveFields) {
    if (field in result && typeof result[field] === 'string') {
      try {
        result[field] = decryptWithDEK(result[field], dek);
      } catch {
        // Value was not encrypted (plain text or legacy format)
      }
    }
  }
  return result;
}

/**
 * Masks sensitive fields for safe return in API responses.
 * Replaces values with `****` + last 4 characters.
 */
export function maskProfile(
  config: Record<string, unknown>,
  sensitiveFields: string[],
): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...config };
  for (const field of sensitiveFields) {
    if (field in masked && typeof masked[field] === 'string') {
      const value = masked[field];
      masked[field] = value.length <= 4 ? '****' : '****' + value.slice(-4);
    }
  }
  return masked;
}
