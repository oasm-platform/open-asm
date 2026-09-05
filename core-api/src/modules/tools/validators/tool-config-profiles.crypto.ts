import { encrypt } from '@/common/utils/encryption.util';
import {
  decryptWithDEK,
  encryptWithDEK,
} from '@/common/utils/workspace-encryption.util';

/**
 * Fallback heuristic: property names conventionally used for secrets, matched
 * case-insensitively. Covers connector manifests that omit the ui:widget
 * marker (e.g. nessus accessKey/password/secretKey in
 * resources/connectors/manifest.json) while skipping ordinary identifiers
 * like username, policyId, url, host, clientId.
 *
 * Regex choice: /(password|passwd|secret|token|api_?key|access_?key)/i.
 * Deliberate trade-off: `token`/`secret` match as substrings, so a field such
 * as `tokenExpirySeconds` is also treated as sensitive. Decrypt/mask are
 * transparent to consumers, so a false positive costs one extra encrypt+mask
 * round trip; a false negative would leak a secret in plaintext.
 */
const SENSITIVE_NAME_RE =
  /(password|passwd|secret|token|api_?key|access_?key)/i;

function isSensitiveField(key: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if ((value as Record<string, unknown>)['ui:widget'] === 'password') {
    return true;
  }
  return SENSITIVE_NAME_RE.test(key);
}

/**
 * Scans a JSON Schema for sensitive properties: those marked with
 * `"ui:widget": "password"` or matching the name heuristic above.
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

  const addSensitive = (props: Record<string, unknown> | undefined) => {
    if (!props) return;
    for (const [key, value] of Object.entries(props)) {
      if (isSensitiveField(key, value)) fields.add(key);
    }
  };

  addSensitive(schema.properties as Record<string, unknown> | undefined);

  // Also scan oneOf/anyOf sub-schemas (integrations-style)
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const branches = schema[keyword] as
      | Record<string, unknown>[]
      | undefined;
    if (!Array.isArray(branches)) continue;
    for (const sub of branches) {
      addSensitive(sub.properties as Record<string, unknown> | undefined);
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
