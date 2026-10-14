import type { IntegrationType } from '@/common/enums/enum';

/**
 * Schema keyword a multi-capability app uses to declare what it can do, keyed
 * by capability (IntegrationType value). Apps WITHOUT it are legacy
 * single-capability apps whose only capability is `properties.category.const`.
 *
 * Lives here (not in ../capabilities.ts) so schema files can import it
 * without a cycle through universal-integration.schema.ts.
 */
export const CAPABILITIES_KEYWORD = 'x-capabilities';

/**
 * Property keyword scoping a config field to one capability: the console only
 * shows it while that capability is enabled.
 */
export const CAPABILITY_FIELD_KEYWORD = 'ui:capability';

export interface CapabilityMeta {
  title: string;
  description?: string;
  /** Pre-selected in the connect form. */
  default?: boolean;
}

/**
 * Builds the shared discriminator properties of a multi-capability schema:
 * `category` (primary capability) and `capabilities` (enabled subset).
 */
export function capabilityDiscriminators(supported: IntegrationType[]) {
  return {
    category: { enum: supported, title: 'Primary capability' },
    capabilities: {
      type: 'array',
      title: 'Capabilities',
      items: { enum: supported },
      minItems: 1,
      uniqueItems: true,
    },
  } as const;
}

/**
 * Tags every property with `ui:capability` so it only shows (and is only
 * meaningful) while `capability` is enabled. Use with shared property sets,
 * e.g. `...scopeToCapability(severityProperties, IntegrationType.TICKETING)`.
 */
export function scopeToCapability<T extends Record<string, object>>(
  properties: T,
  capability: IntegrationType,
): { [K in keyof T]: T[K] & { [CAPABILITY_FIELD_KEYWORD]: IntegrationType } } {
  return Object.fromEntries(
    Object.entries(properties).map(([key, prop]) => [
      key,
      { ...prop, [CAPABILITY_FIELD_KEYWORD]: capability },
    ]),
  ) as { [K in keyof T]: T[K] & { [CAPABILITY_FIELD_KEYWORD]: IntegrationType } };
}

/**
 * `if/then` clause making `fields` required only while `capability` is
 * enabled. Spread into a schema's `allOf`.
 */
export function requiredWhenCapability(
  capability: IntegrationType,
  fields: string[],
) {
  return {
    if: {
      properties: { capabilities: { contains: { const: capability } } },
      required: ['capabilities'],
    },
    then: { required: fields },
  };
}
