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
  const betterAuthDoc = loadBetterAuthSpec();
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
        ...betterAuthDoc.components.schemas,
      };
    }
    if (betterAuthDoc.components.securitySchemes) {
      document.components.securitySchemes = {
        ...document.components.securitySchemes,
        ...betterAuthDoc.components.securitySchemes,
      };
    }
  }

  return document;
}
