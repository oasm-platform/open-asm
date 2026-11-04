import { DataKind, TargetType, ToolCategory } from '@/common/enums/enum';

/**
 * What a tool takes and what it finds, per category.
 *
 * Every capability declares `inputs` (the kinds of data it accepts, best
 * first) and `produces` (the kinds of data its results add). Connector
 * manifests and the built-in tools declare them; the defaults below fill in
 * for a manifest written before these fields existed, so it keeps running the
 * way it always did. docs/workflows.md describes the kinds.
 */

/** Kinds a tool may take as input. `vulnerability` is output only. */
export const INPUT_KINDS: readonly DataKind[] = [
  DataKind.TARGET,
  DataKind.HOST,
  DataKind.SERVICE,
  DataKind.WEB,
  DataKind.URL,
  DataKind.REPOSITORY,
];

/** Kinds a tool may produce. A target is only ever added by a person. */
export const PRODUCED_KINDS: readonly DataKind[] = [
  DataKind.HOST,
  DataKind.SERVICE,
  DataKind.WEB,
  DataKind.URL,
  DataKind.VULNERABILITY,
];

/**
 * Inputs of a category that declares none: what the platform dispatched to
 * it before `inputs` existed.
 */
export function defaultInputs(
  category: ToolCategory,
  targetTypes: readonly TargetType[],
): DataKind[] {
  switch (category) {
    case ToolCategory.SUBDOMAINS:
      return [DataKind.TARGET];
    case ToolCategory.PORTS_SCANNER:
      return [DataKind.HOST];
    case ToolCategory.HTTP_PROBE:
      return [DataKind.SERVICE];
    case ToolCategory.SCREENSHOT:
    case ToolCategory.URL_DISCOVERY:
      return [DataKind.WEB];
    case ToolCategory.VULNERABILITIES:
      // A repository scanner only ever sees Git organization targets.
      return targetTypes.length > 0 &&
        targetTypes.every((type) => type === TargetType.GIT_ORG)
        ? [DataKind.REPOSITORY]
        : [DataKind.HOST];
  }
}

/** What a category's results add, for a capability that declares nothing. */
export function defaultProduces(category: ToolCategory): DataKind[] {
  switch (category) {
    case ToolCategory.SUBDOMAINS:
      return [DataKind.HOST];
    case ToolCategory.PORTS_SCANNER:
      return [DataKind.SERVICE];
    case ToolCategory.HTTP_PROBE:
      return [DataKind.WEB];
    case ToolCategory.SCREENSHOT:
      return [];
    case ToolCategory.URL_DISCOVERY:
      return [DataKind.URL];
    case ToolCategory.VULNERABILITIES:
      return [DataKind.VULNERABILITY];
  }
}

/**
 * Reads a manifest list of kinds, keeping order and dropping duplicates.
 * Values outside `allowed` are returned in `unknown` so the caller can log
 * them instead of failing the whole sync.
 */
export function parseKinds(
  raw: unknown,
  allowed: readonly DataKind[],
): { kinds: DataKind[]; unknown: string[] } {
  const kinds: DataKind[] = [];
  const unknown: string[] = [];
  for (const value of Array.isArray(raw) ? raw : []) {
    const kind = String(value).trim().toLowerCase() as DataKind;
    if (!allowed.includes(kind)) {
      unknown.push(String(value));
    } else if (!kinds.includes(kind)) {
      kinds.push(kind);
    }
  }
  return { kinds, unknown };
}

/** A capability as stored; rows synced before `inputs` existed lack it. */
type StoredCapability = {
  name: ToolCategory;
  targetTypes?: readonly TargetType[];
  inputs?: readonly DataKind[];
};

/** The inputs a capability accepts: declared, else its category's defaults. */
export function capabilityInputs(capability: StoredCapability): DataKind[] {
  return capability.inputs?.length
    ? [...capability.inputs]
    : defaultInputs(capability.name, capability.targetTypes ?? []);
}

/**
 * The inputs a workflow step runs with: the step's own `input` when it sets
 * one, else the capability's. A step may only narrow or reorder what the
 * capability accepts.
 *
 * @throws Error naming the kinds the capability does not take.
 */
export function resolveStepInputs(
  toolName: string,
  capability: StoredCapability,
  requested?: readonly DataKind[],
): DataKind[] {
  const accepted = capabilityInputs(capability);
  if (!requested?.length) return accepted;
  const rejected = requested.filter((kind) => !accepted.includes(kind));
  if (rejected.length > 0) {
    throw new Error(
      `"${toolName}" (${capability.name}) takes ${accepted.join(', ')}; it cannot take ${rejected.join(', ')}`,
    );
  }
  return [...requested];
}
