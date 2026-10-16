import { TargetType, ToolCategory } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { parseManifestTargetTypes, sameTargetTypes } from './tool-target-types';

/**
 * One mode a tool can run in, and the target types that mode may scan.
 * `tools.categories` holds these in order; the first one is the default a
 * workflow step gets when it names no category.
 */
export class ToolCategorySpec {
  @ApiProperty({ enum: ToolCategory, enumName: 'ToolCategory' })
  name: ToolCategory;

  @ApiProperty({ enum: TargetType, enumName: 'TargetType', isArray: true })
  targetTypes: TargetType[];
}

/** One manifest capability: `{ name, targetTypes, inputsSchema? }`. */
export type ManifestCapability = {
  name: string;
  targetTypes: string[];
  inputsSchema?: Record<string, unknown>;
};

/** Manifest capability → platform category (several capabilities share one). */
export function capabilityToCategory(
  capability: string,
): ToolCategory | undefined {
  switch (capability.toLowerCase()) {
    case 'subdomains':
      return ToolCategory.SUBDOMAINS;
    case 'http_probe':
      return ToolCategory.HTTP_PROBE;
    case 'ports_scanner':
    case 'port_scanner':
      return ToolCategory.PORTS_SCANNER;
    // Repository scanners report findings too: they share the vulnerabilities
    // result path; their target types (git_org) keep them apart from host scanners.
    case 'vulnerabilities':
    case 'secrets':
    case 'sca':
    case 'sast':
      return ToolCategory.VULNERABILITIES;
    case 'screenshot':
      return ToolCategory.SCREENSHOT;
    case 'url_discovery':
      return ToolCategory.URL_DISCOVERY;
    default:
      return undefined;
  }
}

type ParsedCapability = {
  spec: ToolCategorySpec;
  inputsSchema?: Record<string, unknown>;
};

function parseCapabilities(capabilities: unknown): {
  parsed: ParsedCapability[];
  skipped: string[];
  unknownTargetTypes: string[];
} {
  const parsed: ParsedCapability[] = [];
  const skipped: string[] = [];
  const unknownTargetTypes = new Set<string>();

  const entries: unknown[] = Array.isArray(capabilities) ? capabilities : [];
  for (const entry of entries) {
    const raw = (
      typeof entry === 'object' && entry !== null ? entry : { name: entry }
    ) as Partial<ManifestCapability>;
    const capName = String(raw.name ?? '');
    const name = capabilityToCategory(capName);
    if (!name) {
      skipped.push(`${capName} (unknown capability)`);
      continue;
    }
    // No fallback to host targets: a repository scanner without target types
    // must not start receiving IPs.
    const declared = Array.isArray(raw.targetTypes) ? raw.targetTypes : [];
    const { targetTypes, unknown } = parseManifestTargetTypes(declared);
    unknown.forEach((t) => unknownTargetTypes.add(t));
    if (unknown.length === declared.length) {
      skipped.push(`${capName} (no targetTypes)`);
      continue;
    }

    const existing = parsed.find((p) => p.spec.name === name);
    if (existing) {
      for (const t of targetTypes) {
        if (!existing.spec.targetTypes.includes(t)) {
          existing.spec.targetTypes.push(t);
        }
      }
      existing.inputsSchema ??= raw.inputsSchema;
    } else {
      parsed.push({
        spec: { name, targetTypes: [...targetTypes] },
        inputsSchema: raw.inputsSchema,
      });
    }
  }
  return { parsed, skipped, unknownTargetTypes: [...unknownTargetTypes] };
}

/** Manifest `capabilities` → ordered category specs for `tools.categories`. */
export function parseManifestCategories(capabilities: unknown): {
  categories: ToolCategorySpec[];
  skipped: string[];
  unknownTargetTypes: string[];
} {
  const { parsed, skipped, unknownTargetTypes } =
    parseCapabilities(capabilities);
  return { categories: parsed.map((p) => p.spec), skipped, unknownTargetTypes };
}

/** Categories of a manifest entry with each one's inputs schema (for the API). */
export function connectorCategories(
  capabilities: unknown,
): Array<ToolCategorySpec & { inputsSchema?: Record<string, unknown> }> {
  return parseCapabilities(capabilities).parsed.map((p) => ({
    ...p.spec,
    ...(p.inputsSchema ? { inputsSchema: p.inputsSchema } : {}),
  }));
}

type HasCategories = {
  name: string;
  categories?: ToolCategorySpec[] | null;
};

/**
 * The category a job of `tool` runs: the requested one, else the tool's first.
 * Throws when the tool does not declare the requested category.
 */
export function resolveToolCategory(
  tool: HasCategories,
  requested?: string,
): ToolCategorySpec {
  const categories = tool.categories ?? [];
  if (categories.length === 0) {
    throw new Error(`Tool "${tool.name}" declares no category`);
  }
  if (!requested) return categories[0];
  const found = categories.find((c) => (c.name as string) === requested);
  if (!found) {
    throw new Error(
      `Tool "${tool.name}" has no category "${requested}" (has: ${categories.map((c) => c.name).join(', ')})`,
    );
  }
  return found;
}

export function toolHasCategory(
  tool: HasCategories,
  category: string,
): boolean {
  return (tool.categories ?? []).some((c) => (c.name as string) === category);
}

/** Order-sensitive on categories (order decides the default), not on target types. */
export function sameCategories(
  a: readonly ToolCategorySpec[] | null | undefined,
  b: readonly ToolCategorySpec[] | null | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every(
      (c, i) =>
        c.name === right[i].name &&
        sameTargetTypes(c.targetTypes, right[i].targetTypes),
    )
  );
}
