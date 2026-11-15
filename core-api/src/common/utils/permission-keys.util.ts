/**
 * The rule every workspace permission check applies (WorkspacePermissionGuard
 * for HTTP routes, the agent tools for chat): `*` passes everything, a key
 * passes itself, and `{domain}.write` also passes `{domain}.read`.
 *
 * @returns the first required key the holder lacks, or null when all are held.
 */
export function firstMissingPermission(
  held: readonly string[],
  required: readonly string[],
): string | null {
  if (held.includes('*')) return null;
  for (const key of required) {
    if (held.includes(key)) continue;
    if (
      key.endsWith('.read') &&
      held.includes(`${key.slice(0, -'.read'.length)}.write`)
    ) {
      continue;
    }
    return key;
  }
  return null;
}
