import * as fs from 'fs';
import * as path from 'path';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Minimal shape of the better-auth OpenAPI fragment we merge.
 */
interface BetterAuthSpec {
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<
    string,
    Record<
      string,
      {
        tags?: string[];
        [key: string]: unknown;
      }
    >
  >;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

/**
 * Merge Better Auth OpenAPI paths, schemas, security schemes into the
 * main Swagger document.
 *
 * Tag rules for better-auth endpoints:
 * - "Default" tag → replaced with "Authentication"
 * - "Admin" tag → kept as-is (merged into swagger unchanged)
 * - No tags → "Authentication"
 * - Other tags → preserved
 */
/**
 * OpenAPI 3.1 allows `type` to be an array (e.g. `["object", "null"]`), but
 * tools validating against OpenAPI 3.0 (orval) reject it. Normalize array-form
 * `type` into a single `type` plus `nullable: true`.
 */
/**
 * JSON Schema 3.1 keywords that are not part of the OpenAPI 3.0 Schema
 * Object. orval validates against OpenAPI 3.0 and rejects these, so they
 * are dropped during normalization. `propertyNames` appears in the
 * better-auth spec (e.g. sign-in/social additionalData, admin endpoints).
 */
const NON_OA30_SCHEMA_KEYS = new Set(['propertyNames']);

export function normalizeSchemaType(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSchemaType);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (NON_OA30_SCHEMA_KEYS.has(key)) continue;
      result[key] = normalizeSchemaType(child);
    }
    if (Array.isArray(result.type)) {
      const types = result.type as string[];
      const hasNull = types.includes('null');
      const nonNullTypes = types.filter((t) => t !== 'null');
      result.type = nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes;
      if (hasNull) result.nullable = true;
    }
    return result;
  }
  return value;
}

function loadBetterAuthSpec(): BetterAuthSpec | null {
  const betterAuthPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.open-api',
    'better-auth.json',
  );
  if (!fs.existsSync(betterAuthPath)) return null;
  return JSON.parse(fs.readFileSync(betterAuthPath, 'utf-8')) as BetterAuthSpec;
}

export function mergeBetterAuthSpec(
  document: OpenAPIObject,
): OpenAPIObject {
  const betterAuthDoc = normalizeSchemaType(
    loadBetterAuthSpec(),
  ) as BetterAuthSpec | null;
  if (!betterAuthDoc) return document;

  // Merge tags (skip "Default" — replaced by "Authentication")
  const existingTagNames = new Set(
    (document.tags ?? []).map((t) => t.name),
  );

  for (const tag of betterAuthDoc.tags ?? []) {
    if (tag.name === 'Default') {
      // Add "Authentication" in place of "Default"
      if (!existingTagNames.has('Authentication')) {
        document.tags = document.tags ?? [];
        document.tags.push({ name: 'Authentication' });
        existingTagNames.add('Authentication');
      }
    } else if (!existingTagNames.has(tag.name)) {
      document.tags = document.tags ?? [];
      document.tags.push({ ...tag });
    }
  }

  // Merge paths
  if (betterAuthDoc.paths) {
    for (const [pathKey, methods] of Object.entries(
      betterAuthDoc.paths,
    )) {
      document.paths[pathKey] = document.paths[pathKey] ?? {};
      for (const [method, operation] of Object.entries(methods)) {
        const currentTags: string[] = operation.tags ?? [];

        let newTags: string[];
        if (currentTags.length === 0) {
          // No tags → Authentication
          newTags = ['Authentication'];
        } else {
          newTags = currentTags.map((t: string) =>
            t === 'Default' ? 'Authentication' : t,
          );
        }

        document.paths[pathKey][method] = {
          ...operation,
          tags: newTags,
        };
      }
    }
  }

  // Merge components
  if (betterAuthDoc.components) {
    document.components = document.components ?? {};
    if (betterAuthDoc.components.schemas) {
      document.components.schemas = {
        ...document.components.schemas,
        ...(betterAuthDoc.components.schemas as typeof document.components.schemas),
      };
    }
    if (betterAuthDoc.components.securitySchemes) {
      document.components.securitySchemes = {
        ...document.components.securitySchemes,
        ...(betterAuthDoc.components.securitySchemes as typeof document.components.securitySchemes),
      };
    }
  }

  return document;
}
