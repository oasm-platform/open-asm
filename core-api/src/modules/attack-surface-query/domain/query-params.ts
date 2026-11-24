import { invalidQuery, type AsqIssue } from './query-errors';

/*
 * Parameters of a saved query. A saved spec may declare
 *
 *   "params": { "<name>": { "type": "string" | "number" | "list", "default": <value>, "description"? } }
 *
 * and use `{ "$param": "<name>" }` as a filter value, a limit, or a window
 * bound. `applyParams` swaps the markers for the caller's values (or the
 * defaults) on the raw JSON, before the batch is parsed: zod and the catalog
 * validator then check every substituted value like a literal one.
 */

export type ParamType = 'string' | 'number' | 'list';

export const PARAM_LIMITS = { params: 10, length: 255, items: 100 } as const;
const NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/** Keys whose value may be a marker; `items`/`value` arrays hold markers too. */
const VALUE_KEYS = new Set(['value', 'limit', 'since', 'until']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isMarker = (v: unknown): v is { $param: unknown } =>
  isObject(v) && '$param' in v && Object.keys(v).length === 1;

/** Checks a value against a type; returns an error message or null. */
function checkValue(type: ParamType, value: unknown): string | null {
  const okString = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= PARAM_LIMITS.length && !s.includes('\u0000');
  switch (type) {
    case 'string':
      return okString(value) ? null : `must be a 1-${PARAM_LIMITS.length} character string`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number';
    case 'list':
      return Array.isArray(value) && value.length > 0 && value.length <= PARAM_LIMITS.items && value.every(okString)
        ? null
        : `must be 1-${PARAM_LIMITS.items} strings`;
  }
}

interface Declared {
  type: ParamType;
  value: unknown;
}

function readDeclarations(raw: unknown, issues: AsqIssue[]): Map<string, Declared> {
  const out = new Map<string, Declared>();
  if (raw === undefined) return out;
  if (!isObject(raw)) {
    issues.push({ path: 'params', code: 'INVALID_SHAPE', message: 'params must be an object of declarations' });
    return out;
  }
  const entries = Object.entries(raw);
  if (entries.length > PARAM_LIMITS.params) {
    issues.push({ path: 'params', code: 'LIMIT_EXCEEDED', message: `at most ${PARAM_LIMITS.params} params` });
  }
  for (const [name, decl] of entries) {
    const at = `params.${name}`;
    if (!NAME.test(name)) {
      issues.push({ path: at, code: 'INVALID_SHAPE', message: 'param names match ^[a-zA-Z][a-zA-Z0-9_]{0,63}$' });
      continue;
    }
    if (!isObject(decl) || !['string', 'number', 'list'].includes(decl.type as string)) {
      issues.push({ path: at, code: 'INVALID_SHAPE', message: 'a param is { "type": "string" | "number" | "list", "default": … }' });
      continue;
    }
    const extra = Object.keys(decl).filter((k) => !['type', 'default', 'description'].includes(k));
    if (extra.length) issues.push({ path: at, code: 'INVALID_SHAPE', message: `unknown key(s): ${extra.join(', ')}` });
    if (decl.description !== undefined && (typeof decl.description !== 'string' || decl.description.length > 500)) {
      issues.push({ path: `${at}.description`, code: 'INVALID_SHAPE', message: 'description is a string of at most 500 characters' });
    }
    const type = decl.type as ParamType;
    const error = checkValue(type, decl.default);
    if (error) {
      issues.push({ path: `${at}.default`, code: 'INVALID_VALUE', message: `every param needs a default that ${error}` });
      continue;
    }
    out.set(name, { type, value: decl.default });
  }
  return out;
}

/**
 * Returns the batch of a (saved) spec with every `$param` replaced: the
 * supplied value, else the declared default. Unknown or misplaced markers,
 * undeclared supplied params and bad values are INVALID_QUERY. The `params`
 * declaration itself is dropped from the result.
 */
export function applyParams(spec: Record<string, unknown>, supplied: Record<string, unknown> = {}): Record<string, unknown> {
  const issues: AsqIssue[] = [];
  const { params: rawDecl, ...batch } = spec;
  const declared = readDeclarations(rawDecl, issues);

  for (const [name, value] of Object.entries(supplied)) {
    const decl = declared.get(name);
    if (!decl) {
      issues.push({ path: `params.${name}`, code: 'INVALID_SHAPE', message: `"${name}" is not a param of this query (params: ${[...declared.keys()].join(', ') || 'none'})` });
      continue;
    }
    const error = checkValue(decl.type, value);
    if (error) issues.push({ path: `params.${name}`, code: 'INVALID_VALUE', message: `${name} ${error}` });
    else decl.value = value;
  }

  const used = new Set<string>();
  const walk = (node: unknown, path: string, key: string | undefined): unknown => {
    if (isMarker(node)) {
      const name = node.$param;
      const decl = typeof name === 'string' ? declared.get(name) : undefined;
      if (!decl) {
        issues.push({ path, code: 'INVALID_SHAPE', message: `unknown param ${JSON.stringify(name)}` });
        return node;
      }
      if (!key || !VALUE_KEYS.has(key)) {
        issues.push({ path, code: 'INVALID_SHAPE', message: 'a param can only stand for a filter value, a limit or a window bound' });
        return node;
      }
      used.add(name as string);
      // Filter values are strings; a number param reads as its digits there.
      if (key === 'value' && decl.type === 'number') return String(decl.value);
      return decl.value;
    }
    if (Array.isArray(node)) {
      // An element of `value: [...]` may be a marker of a string param.
      return node.map((item, i) => walk(item, `${path}[${i}]`, key === 'value' ? 'value' : undefined));
    }
    if (isObject(node)) {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, path ? `${path}.${k}` : k, k)]));
    }
    return node;
  };
  const result = walk(batch, '', undefined) as Record<string, unknown>;

  for (const name of declared.keys()) {
    if (!used.has(name)) issues.push({ path: `params.${name}`, code: 'INVALID_SHAPE', message: `param "${name}" is declared but never used` });
  }
  if (issues.length) throw invalidQuery(issues);
  return result;
}
