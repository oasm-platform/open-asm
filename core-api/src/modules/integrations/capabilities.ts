import type { IntegrationType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';
import {
  CAPABILITIES_KEYWORD,
  type CapabilityMeta,
} from './schemas/capability-fields';
import { universalIntegrationSchema } from './schemas/universal-integration.schema';

/**
 * Capability model
 * ────────────────
 * Legacy apps (Slack, Telegram, AWS, …) keep `category: { const }` in their
 * schema and have exactly one capability: that category.
 *
 * Multi-capability apps (GitHub, GitLab) declare
 * ```ts
 * 'x-capabilities': {
 *   SOURCE_CODE: { title: 'Repositories', default: true },
 *   TICKETING:   { title: 'Issues' },
 * }
 * ```
 * and the user picks a non-empty subset at connect time, stored in
 * `integrations.capabilities`. Everything that used to branch on
 * `integration.category === X` asks {@link hasCapability} instead, which is
 * correct for both kinds.
 */

interface AppSchema {
  $id?: string;
  properties?: Record<string, unknown>;
  [CAPABILITIES_KEYWORD]?: Record<string, CapabilityMeta>;
}

/** Everything that has a stored capability set. */
interface CapabilityHolder {
  category: string;
  capabilities?: string[] | null;
}

function findAppSchema(appType: string): AppSchema | undefined {
  const oneOf = universalIntegrationSchema.oneOf as unknown as AppSchema[];
  return oneOf.find((schema) => {
    const appTypeProp = schema.properties?.app_type as
      | { const?: string }
      | undefined;
    return (appTypeProp?.const ?? schema.$id) === appType;
  });
}

/** True when the app declares `x-capabilities` (the new multi-capability model). */
export function isMultiCapabilityApp(appType: string): boolean {
  return !!findAppSchema(appType)?.[CAPABILITIES_KEYWORD];
}

/**
 * Capabilities an app supports. Legacy apps report their single
 * `category.const`; unknown apps report none.
 */
export function getSupportedCapabilities(appType: string): string[] {
  const schema = findAppSchema(appType);
  if (!schema) return [];
  const declared = schema[CAPABILITIES_KEYWORD];
  if (declared) return Object.keys(declared);
  const category = (schema.properties?.category as { const?: string })?.const;
  return category ? [category] : [];
}

/**
 * Capabilities an integration row has enabled.
 *
 * Falls back to `[category]` when the array is empty: a row written by code
 * that predates the `capabilities` column (or before the backfill ran) is a
 * single-capability integration whose capability IS its category.
 */
export function resolveCapabilities(integration: CapabilityHolder): string[] {
  return integration.capabilities?.length
    ? integration.capabilities
    : [integration.category];
}

export function hasCapability(
  integration: CapabilityHolder,
  capability: IntegrationType,
): boolean {
  return resolveCapabilities(integration).includes(capability);
}

/**
 * Validates and normalises the requested capability set for an app.
 *
 * - Legacy app: exactly one capability, equal to the schema's category. An
 *   omitted `capabilities` is filled from `category` so existing clients that
 *   only send `category` keep working unchanged.
 * - Multi-capability app: a non-empty subset of `x-capabilities`. Omitted →
 *   `[category]`. `category` becomes the primary capability: kept when it is
 *   still enabled, otherwise the first enabled one (so the NOT NULL column
 *   always holds an enabled capability).
 */
export function normalizeCapabilities(args: {
  appType: string;
  category: string;
  capabilities?: string[];
}): { category: string; capabilities: string[] } {
  const supported = getSupportedCapabilities(args.appType);
  if (supported.length === 0) {
    throw new BadRequestException(
      `Unknown integration app "${args.appType}"`,
    );
  }

  const requested = [
    ...new Set(
      args.capabilities?.length ? args.capabilities : [args.category],
    ),
  ];
  const unsupported = requested.filter((cap) => !supported.includes(cap));
  if (unsupported.length > 0) {
    throw new BadRequestException(
      `Integration app "${args.appType}" does not support: ${unsupported.join(', ')}. Supported: ${supported.join(', ')}`,
    );
  }

  if (!isMultiCapabilityApp(args.appType)) {
    // Legacy: the only valid set is the single category itself.
    if (requested.length !== 1 || requested[0] !== args.category) {
      throw new BadRequestException(
        `Integration app "${args.appType}" only supports ${supported[0]}`,
      );
    }
    return { category: args.category, capabilities: requested };
  }

  const category = requested.includes(args.category)
    ? args.category
    : requested[0];
  return { category, capabilities: requested };
}
