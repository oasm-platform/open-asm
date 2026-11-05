import { DataKind, TargetType, ToolCategory } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  defaultInputs,
  defaultProduces,
  INPUT_KINDS,
  parseKinds,
  PRODUCED_KINDS,
} from './tool-io';
import { parseManifestTargetTypes, sameTargetTypes } from './tool-target-types';

/**
 * One mode a tool can run in: the target types it may scan, the data it
 * takes and the data it finds. `tools.categories` holds these in order; the
 * first one is the default a workflow step gets when it names no category.
 */
export class ToolCategorySpec {
  @ApiProperty({ enum: ToolCategory, enumName: 'ToolCategory' })
  name: ToolCategory;

  @ApiProperty({ enum: TargetType, enumName: 'TargetType', isArray: true })
  targetTypes: TargetType[];

  /** Kinds of data the tool accepts, best first (see tool-io.ts). */
  @ApiProperty({ enum: DataKind, enumName: 'DataKind', isArray: true })
  inputs: DataKind[];

  /** Kinds of data its results add, for the steps after it. */
  @ApiProperty({ enum: DataKind, enumName: 'DataKind', isArray: true })
  produces: DataKind[];
}

/**
 * A category with its inputs and outputs filled in: the declared ones, else
 * the category's defaults. Every writer of `tools.categories` goes through it.
 */
export function categorySpec(
  name: ToolCategory,
  targetTypes: TargetType[],
  io: { inputs?: DataKind[]; produces?: DataKind[] } = {},
): ToolCategorySpec {
  return {
    name,
    targetTypes,
    inputs: io.inputs?.length ? io.inputs : defaultInputs(name, targetTypes),
    produces: io.produces ?? defaultProduces(name),
  };
}

/** One manifest capability: `{ name, targetTypes, inputs?, produces?, inputsSchema? }`. */
export type ManifestCapability = {
  name: string;
  targetTypes: string[];
  inputs?: string[];
  produces?: string[];
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
  unknownKinds: string[];
} {
  const parsed: ParsedCapability[] = [];
  const skipped: string[] = [];
  const unknownTargetTypes = new Set<string>();
  const unknownKinds = new Set<string>();

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
    const { targetTypes, unknown } = parseManifestTargetTypes(raw.targetTypes);
    unknown.forEach((t) => unknownTargetTypes.add(t));
    if (targetTypes.length === 0) {
      skipped.push(`${capName} (no targetTypes)`);
      continue;
    }

    const inputs = parseKinds(raw.inputs, INPUT_KINDS);
    const produces = parseKinds(raw.produces, PRODUCED_KINDS);
    [...inputs.unknown, ...produces.unknown].forEach((k) => unknownKinds.add(k));
    const spec = categorySpec(name, [...targetTypes], {
      inputs: inputs.kinds,
      // An absent list means "not declared"; an empty one means "nothing".
      produces: Array.isArray(raw.produces) ? produces.kinds : undefined,
    });

    const existing = parsed.find((p) => p.spec.name === name);
    if (existing) {
      // Capabilities sharing a category (secrets, sca → vulnerabilities)
      // merge: target types, inputs and outputs add up.
      union(existing.spec.targetTypes, spec.targetTypes);
      union(existing.spec.inputs, spec.inputs);
      union(existing.spec.produces, spec.produces);
      existing.inputsSchema ??= raw.inputsSchema;
    } else {
      parsed.push({ spec, inputsSchema: raw.inputsSchema });
    }
  }
  return {
    parsed,
    skipped,
    unknownTargetTypes: [...unknownTargetTypes],
    unknownKinds: [...unknownKinds],
  };
}

/** Appends the values of `extra` that `into` lacks, keeping order. */
function union<T>(into: T[], extra: readonly T[]): void {
  for (const value of extra) {
    if (!into.includes(value)) into.push(value);
  }
}

/** Manifest `capabilities` → ordered category specs for `tools.categories`. */
export function parseManifestCategories(capabilities: unknown): {
  categories: ToolCategorySpec[];
  skipped: string[];
  unknownTargetTypes: string[];
  unknownKinds: string[];
} {
  const { parsed, skipped, unknownTargetTypes, unknownKinds } =
    parseCapabilities(capabilities);
  return {
    categories: parsed.map((p) => p.spec),
    skipped,
    unknownTargetTypes,
    unknownKinds,
  };
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

/**
 * Order-sensitive on categories (order decides the default) and on inputs
 * (order is the preference), not on target types or outputs.
 */
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
        sameTargetTypes(c.targetTypes, right[i].targetTypes) &&
        (c.inputs ?? []).join() === (right[i].inputs ?? []).join() &&
        sameTargetTypes(c.produces ?? [], right[i].produces ?? []),
    )
  );
}
