import type { GetIntegrationDto } from '@/services/apis/gen/queries';

/**
 * Capability model (mirrors core-api `integrations/capabilities.ts`).
 *
 * Legacy apps declare `properties.category.const` and have exactly that one
 * capability. Multi-capability apps (GitHub, GitLab) declare `x-capabilities`
 * and the user enables a subset; the enabled set travels as `capabilities`.
 */

export const CAPABILITIES_KEYWORD = 'x-capabilities';
export const CLOUD_PROVIDER_CAPABILITY = 'CLOUD_PROVIDER';

/** Schema keys that are discriminators, never user-editable config fields. */
export const DISCRIMINATOR_KEYS = ['app_type', 'category', 'capabilities'];

export function isDiscriminatorKey(key: string): boolean {
  return DISCRIMINATOR_KEYS.includes(key);
}

export interface CapabilityMeta {
  title: string;
  description?: string;
  default?: boolean;
}

interface CapabilitySchema {
  properties?: Record<string, unknown>;
  [CAPABILITIES_KEYWORD]?: Record<string, CapabilityMeta>;
  [key: string]: unknown;
}

/** Declared capabilities of a multi-capability app, or undefined for a legacy app. */
export function getCapabilityMeta(
  schema: CapabilitySchema,
): Record<string, CapabilityMeta> | undefined {
  return schema[CAPABILITIES_KEYWORD];
}

export function isMultiCapabilitySchema(schema: CapabilitySchema): boolean {
  return !!getCapabilityMeta(schema);
}

/** Every capability an app supports (legacy: its category const). */
export function getSchemaCapabilities(schema: CapabilitySchema): string[] {
  const meta = getCapabilityMeta(schema);
  if (meta) return Object.keys(meta);
  const category = (schema.properties?.category as { const?: string })?.const;
  return category ? [category] : [];
}

/** Capabilities pre-selected in the connect form. */
export function getDefaultCapabilities(schema: CapabilitySchema): string[] {
  const meta = getCapabilityMeta(schema);
  if (!meta) return getSchemaCapabilities(schema);
  const defaults = Object.entries(meta)
    .filter(([, m]) => m.default)
    .map(([cap]) => cap);
  return defaults.length > 0 ? defaults : Object.keys(meta).slice(0, 1);
}

/** Enabled capabilities of a connected integration. */
export function getIntegrationCapabilities(
  integration: Pick<GetIntegrationDto, 'category' | 'capabilities'>,
): string[] {
  return integration.capabilities?.length
    ? integration.capabilities
    : [integration.category];
}

/** Human label for a capability: the schema title when declared, else Title Case. */
export function capabilityLabel(
  capability: string,
  schema?: CapabilitySchema,
): string {
  const title = schema ? getCapabilityMeta(schema)?.[capability]?.title : undefined;
  return (
    title ??
    capability
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}
