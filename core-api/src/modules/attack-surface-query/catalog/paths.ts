import type {
  Catalog,
  FieldDef,
  ManyRelationDef,
  ResourceDef,
} from './catalog.types';

/** One hop of a resolved path. */
export type PathHop =
  | { kind: 'one'; name: string; from: ResourceDef; to: ResourceDef }
  | { kind: 'many'; name: string; from: ResourceDef; to: ResourceDef; def: ManyRelationDef };

/** A field path resolved against the catalog, e.g. `host.target.value`. */
export interface ResolvedPath {
  path: string;
  hops: PathHop[];
  /** Resource owning the field. */
  owner: ResourceDef;
  fieldName: string;
  field: FieldDef;
}

export type PathResolution =
  | { ok: true; value: ResolvedPath }
  | { ok: false; code: 'UNKNOWN_FIELD' | 'UNKNOWN_RELATION' | 'LIMIT_EXCEEDED'; message: string };

export interface PathRules {
  /** Allow one many-relation hop (only `where`: compiled to EXISTS). */
  allowMany: boolean;
  /** Maximum one-relation hops. */
  maxOneHops: number;
}

/** Levenshtein distance, for "did you mean" hints on short names. */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function suggest(name: string, candidates: string[]): string {
  const close = candidates
    .map((c) => ({ c, d: editDistance(name.toLowerCase(), c.toLowerCase()) }))
    .filter(({ d }) => d <= 2)
    .sort((x, y) => x.d - y.d)
    .map(({ c }) => c);
  return close.length ? ` Did you mean "${close[0]}"?` : '';
}

/**
 * Resolves `path` from `root`: one-relation hops, at most one many-relation
 * hop when allowed, then a field. Unknown names get a "did you mean" hint
 * from the names valid at that step.
 */
export function resolvePath(
  catalog: Catalog,
  root: ResourceDef,
  path: string,
  rules: PathRules,
): PathResolution {
  const segments = path.split('.');
  const hops: PathHop[] = [];
  let current = root;
  let oneHops = 0;
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1;
    if (last) {
      const field = Object.prototype.hasOwnProperty.call(current.fields, segment)
        ? current.fields[segment]
        : undefined;
      if (!field) {
        const isRelation = segment in current.one || segment in current.many;
        return {
          ok: false,
          code: 'UNKNOWN_FIELD',
          message: isRelation
            ? `"${path}" ends at the relation "${segment}": name one of its fields (e.g. "${segment}.${defaultFieldOf(catalog, current, segment)}")`
            : `${current.name} has no field "${segment}".${suggest(segment, [
                ...Object.keys(current.fields),
                ...Object.keys(current.one).map((r) => `${r}.`),
              ])} ${namesOf(current)}`,
        };
      }
      return { ok: true, value: { path, hops, owner: current, fieldName: segment, field } };
    }
    const one = Object.prototype.hasOwnProperty.call(current.one, segment) ? current.one[segment] : undefined;
    if (one) {
      oneHops++;
      if (oneHops > rules.maxOneHops) {
        return { ok: false, code: 'LIMIT_EXCEEDED', message: `"${path}" goes through more than ${rules.maxOneHops} relations` };
      }
      const to = catalog[one.resource];
      hops.push({ kind: 'one', name: segment, from: current, to });
      current = to;
      continue;
    }
    const many = Object.prototype.hasOwnProperty.call(current.many, segment) ? current.many[segment] : undefined;
    if (many) {
      if (!rules.allowMany) {
        return {
          ok: false,
          code: 'UNKNOWN_RELATION',
          message: `"${segment}" is a list of ${many.resource}: use include.${segment} to fetch it (only "where" may test it)`,
        };
      }
      if (hops.some((h) => h.kind === 'many')) {
        return { ok: false, code: 'LIMIT_EXCEEDED', message: `"${path}" goes through more than one list relation` };
      }
      const to = catalog[many.resource];
      hops.push({ kind: 'many', name: segment, from: current, to, def: many });
      current = to;
      continue;
    }
    return {
      ok: false,
      code: 'UNKNOWN_RELATION',
      message: `${current.name} has no relation "${segment}".${suggest(segment, [
        ...Object.keys(current.one),
        ...(rules.allowMany ? Object.keys(current.many) : []),
      ])}`,
    };
  }
  return { ok: false, code: 'UNKNOWN_FIELD', message: `"${path}" is empty` };
}

/**
 * Every name valid on `res`, so a caller (the agent) fixes a wrong name in one
 * step instead of guessing again.
 */
export function namesOf(res: ResourceDef): string {
  const one = Object.keys(res.one);
  const many = Object.keys(res.many);
  return `(fields of ${res.name}: ${Object.keys(res.fields).join(', ')}${
    one.length ? `; related rows: ${one.map((r) => `${r}.<field>`).join(', ')}` : ''
  }${many.length ? `; lists (include or where only): ${many.join(', ')}` : ''})`;
}

function defaultFieldOf(catalog: Catalog, res: ResourceDef, relation: string): string {
  const target = catalog[(res.one[relation] ?? res.many[relation]).resource];
  return target.defaultSelect.find((f) => !f.includes('.')) ?? 'id';
}

/** Resources a path reads, for the permission check. */
export function resourcesOf(path: ResolvedPath): ResourceDef[] {
  return [path.owner, ...path.hops.map((h) => h.to)];
}
