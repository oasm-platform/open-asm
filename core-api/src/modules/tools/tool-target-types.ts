import { TargetType } from '@/common/enums/enum';

/**
 * Which target types a tool may scan.
 *
 * Every tool that predates this field scans hosts, so a tool without an
 * explicit list (legacy row, provider tool, connector whose manifest predates
 * `targetTypes`) is treated as a host scanner — exactly its old behaviour.
 */
export const DEFAULT_TOOL_TARGET_TYPES: readonly TargetType[] = [
  TargetType.DOMAIN,
  TargetType.IP,
  TargetType.CIDR,
];

const KNOWN_TARGET_TYPES = new Set<string>(Object.values(TargetType));

/** Effective target types of a tool (falls back to the host default). */
export function resolveToolTargetTypes(tool: {
  targetTypes?: readonly string[] | null;
}): TargetType[] {
  const declared = (tool.targetTypes ?? []).filter((t): t is TargetType =>
    KNOWN_TARGET_TYPES.has(t),
  );
  return declared.length > 0 ? declared : [...DEFAULT_TOOL_TARGET_TYPES];
}

/**
 * Maps a connector manifest's lowercase `targetTypes` (`domain`, `git_org`)
 * onto TargetType values. Values this platform version does not know yet are
 * returned separately so the caller can log them. Nothing usable declared
 * yields an empty list — never the host default, so a repository scanner can
 * never be handed IP targets.
 */
export function parseManifestTargetTypes(raw: unknown): {
  targetTypes: TargetType[];
  unknown: string[];
} {
  const values = Array.isArray(raw) ? raw : [];
  const targetTypes: TargetType[] = [];
  const unknown: string[] = [];
  for (const value of values) {
    const upper = String(value).toUpperCase();
    if (KNOWN_TARGET_TYPES.has(upper)) {
      if (!targetTypes.includes(upper as TargetType)) {
        targetTypes.push(upper as TargetType);
      }
    } else {
      unknown.push(String(value));
    }
  }
  return { targetTypes, unknown };
}

/** Order-insensitive equality, so a re-ordered manifest is not a change. */
export function sameTargetTypes(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}

/**
 * Target type named by a workflow trigger: `domain.create` → DOMAIN,
 * `git_org.re-scan` → GIT_ORG. Undefined for anything unrecognised.
 */
export function triggerTargetType(trigger: string): TargetType | undefined {
  const type = trigger.split('.')[0]?.toUpperCase();
  return type && KNOWN_TARGET_TYPES.has(type) ? (type as TargetType) : undefined;
}
