import type { AsqOp, FieldDef, ResourceDef } from '../catalog/catalog.types';
import type { ResolvedPath } from '../catalog/paths';
import type { WhereNode } from '../domain/where';
import {
  expand,
  FromBuilder,
  PG_ARRAY_TYPE,
  PG_SCALAR_TYPE,
  tenantTerm,
  type ScopeParams,
} from './sql-builder';

type CmpOp = '>' | '>=' | '<' | '<=' | '=' | '<>';
const CMP: Partial<Record<AsqOp, CmpOp>> = { gt: '>', gte: '>=', lt: '<', lte: '<=' };
const COUNT_CMP: Record<string, CmpOp> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Value tests of one field expression; each returns a boolean SQL fragment. */
interface FieldTests {
  any: (p: string) => string;
  all: (p: string) => string;
  like: (p: string) => string;
  subnet: (p: string) => string;
  cmp: (p: string, op: CmpOp) => string;
  between: (from: string, to: string) => string;
  isNull: (negate: boolean) => string;
}

function fieldTests(expr: string, field: FieldDef): FieldTests {
  // NULL compares to NULL: the guard turns it into false, so a negated test
  // (neq, notIn, …) keeps the NULL rows.
  const guard = (sql: string) => (field.nullable ? `COALESCE(${sql}, false)` : sql);
  const arrayType = PG_ARRAY_TYPE[field.type] ?? 'text[]';
  const scalarType = PG_SCALAR_TYPE[field.type] ?? 'text';
  const isNull = (negate: boolean) => `${expr} IS ${negate ? 'NOT ' : ''}NULL`;
  if (field.type === 'textArray') {
    return {
      any: (p) => guard(`${expr} && CAST(${p} AS text[])`),
      all: (p) => guard(`${expr} @> CAST(${p} AS text[])`),
      like: (p) => `EXISTS (SELECT 1 FROM unnest(${expr}) asq_el WHERE asq_el ILIKE ${p})`,
      subnet: () => 'false',
      cmp: () => 'false',
      between: () => 'false',
      isNull,
    };
  }
  return {
    any: (p) => guard(`${expr} = ANY(CAST(${p} AS ${arrayType}))`),
    all: (p) => guard(`${expr} = ANY(CAST(${p} AS ${arrayType}))`),
    like: (p) => guard(`${expr} ILIKE ${p}`),
    subnet: (p) => guard(`${expr} <<= ANY(CAST(${p} AS inet[]))`),
    cmp: (p, op) => guard(`${expr} ${op} CAST(${p} AS ${scalarType})`),
    between: (from, to) =>
      guard(`${expr} >= CAST(${from} AS ${scalarType}) AND ${expr} <= CAST(${to} AS ${scalarType})`),
    isNull,
  };
}

/** Wraps every test in "a related row exists such that …". */
function wrapTests(tests: FieldTests, wrap: (sql: string) => string): FieldTests {
  return {
    any: (p) => wrap(tests.any(p)),
    all: (p) => wrap(tests.all(p)),
    like: (p) => wrap(tests.like(p)),
    subnet: (p) => wrap(tests.subnet(p)),
    cmp: (p, op) => wrap(tests.cmp(p, op)),
    between: (a, b) => wrap(tests.between(a, b)),
    isNull: (negate) => wrap(tests.isNull(negate)),
  };
}

/** Correlation of a list relation's child rows with their parent row. */
function correlation(
  hop: { childKey: string; parentKey: string; extra?: string },
  childResource: ResourceDef,
  child: string,
  parentAlias: string,
  scope: ScopeParams,
): string {
  return [
    `${child}.${hop.childKey} = ${expand(hop.parentKey, { a: parentAlias })}`,
    tenantTerm(childResource, child, scope.workspace),
    ...(hop.extra ? [`(${expand(hop.extra, { c: child, a: parentAlias })})`] : []),
    ...(childResource.basePredicate ? [`(${expand(childResource.basePredicate, { a: child })})`] : []),
  ].join(' AND ');
}

class WhereCompiler {
  readonly params: Record<string, unknown> = {};
  /** Tests per list path, built once (one sub-alias per path). */
  private readonly listTests = new Map<string, FieldTests>();
  private sub = 0;

  constructor(
    private readonly scope: ScopeParams,
    private readonly prefix: string,
  ) {}

  private bind(value: unknown): string {
    const name = `${this.prefix}${Object.keys(this.params).length}`;
    this.params[name] = value;
    return `:${name}`;
  }

  private subAlias(from: FromBuilder): string {
    return `${from.rootAlias}_x${this.sub++}`;
  }

  /**
   * A list path in a condition (`services.port`) reads "at least one related
   * row matches"; the negated operators therefore read "no related row
   * matches", because the whole fragment is negated.
   */
  private listPathTests(from: FromBuilder, path: ResolvedPath): FieldTests {
    const cached = this.listTests.get(path.path);
    if (cached) return cached;
    const manyIndex = path.hops.findIndex((h) => h.kind === 'many');
    const hop = path.hops[manyIndex];
    if (hop.kind !== 'many') throw new Error('AttackSurfaceQuery compiler: expected a list hop');
    const parentChain = FromBuilder.oneChain(path);
    from.ensureChain(parentChain);
    const parentAlias = from.aliasOf(parentChain);
    const inner = new FromBuilder(from.catalog, hop.to, this.subAlias(from), this.scope.workspace);
    const innerChain = path.hops.slice(manyIndex + 1).map((h) => h.name);
    const expr = inner.fieldSql(innerChain, path.field);
    if (inner.usesFreshCte) from.usesFreshCte = true;
    const on = correlation(hop.def, hop.to, inner.aliasOf([]), parentAlias, this.scope);
    const tests = wrapTests(
      fieldTests(expr, path.field),
      (sql) => `EXISTS (SELECT 1 FROM ${inner.renderFrom()} WHERE ${on} AND ${sql})`,
    );
    this.listTests.set(path.path, tests);
    return tests;
  }

  private condition(from: FromBuilder, node: Extract<WhereNode, { kind: 'cond' }>): string {
    const tests = node.path.hops.some((h) => h.kind === 'many')
      ? this.listPathTests(from, node.path)
      : fieldTests(from.pathSql(node.path), node.path.field);
    const { op, values } = node;
    switch (op) {
      case 'eq':
      case 'in':
        return `(${tests.any(this.bind(values))})`;
      case 'neq':
      case 'notIn':
        return `NOT (${tests.any(this.bind(values))})`;
      case 'containsAny':
        return `(${tests.any(this.bind(values))})`;
      case 'containsAll':
        return `(${tests.all(this.bind(values))})`;
      case 'contains':
        return `(${tests.like(this.bind(`%${escapeLike(values[0])}%`))})`;
      case 'notContains':
        return `NOT (${tests.like(this.bind(`%${escapeLike(values[0])}%`))})`;
      case 'startsWith':
        return `(${tests.like(this.bind(`${escapeLike(values[0])}%`))})`;
      case 'endsWith':
        return `(${tests.like(this.bind(`%${escapeLike(values[0])}`))})`;
      case 'inSubnet':
        return `(${tests.subnet(this.bind(values))})`;
      case 'notInSubnet':
        return `NOT (${tests.subnet(this.bind(values))})`;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return `(${tests.cmp(this.bind(values[0]), CMP[op]!)})`;
      case 'between':
        return `(${tests.between(this.bind(values[0]), this.bind(values[1]))})`;
      case 'isNull':
        return `(${tests.isNull(false)})`;
      case 'isNotNull':
        return `(${tests.isNull(true)})`;
    }
  }

  private relation(from: FromBuilder, node: Extract<WhereNode, { kind: 'rel' }>): string {
    const { relation } = node;
    from.ensureChain(relation.chain);
    const parentAlias = from.aliasOf(relation.chain);
    const inner = new FromBuilder(from.catalog, relation.child, this.subAlias(from), this.scope.workspace);
    const on = correlation(relation.def, relation.child, inner.aliasOf([]), parentAlias, this.scope);
    // Compile the child filter first: it adds the joins the FROM renders.
    const test = node.where ? this.node(inner, node.where) : undefined;
    if (inner.usesFreshCte) from.usesFreshCte = true;
    const rows = (where: string) => `FROM ${inner.renderFrom()} WHERE ${on}${where}`;
    if (node.count) {
      const n = this.bind(node.count.value);
      return `((SELECT COUNT(*) ${rows(test ? ` AND ${test}` : '')}) ${COUNT_CMP[node.count.op]} CAST(${n} AS int8))`;
    }
    switch (node.quantifier) {
      case 'some':
        return `(EXISTS (SELECT 1 ${rows(test ? ` AND ${test}` : '')}))`;
      case 'none':
        return `(NOT EXISTS (SELECT 1 ${rows(test ? ` AND ${test}` : '')}))`;
      case 'every':
        return `(NOT EXISTS (SELECT 1 ${rows(` AND NOT ${test}`)}))`;
    }
  }

  node(from: FromBuilder, node: WhereNode): string {
    switch (node.kind) {
      case 'cond':
        return this.condition(from, node);
      case 'group':
        return `(${node.items.map((item) => this.node(from, item)).join(node.logic === 'or' ? ' OR ' : ' AND ')})`;
      case 'not':
        return `NOT (${this.node(from, node.item)})`;
      case 'rel':
        return this.relation(from, node);
    }
  }
}

/**
 * Compiles a validated `where` against `from`: one-relation paths join into
 * the statement, list paths and relation tests become correlated (NOT) EXISTS
 * or COUNT subqueries that re-apply the workspace scope. Values go into params
 * only; the result is one parenthesized fragment.
 */
export function compileWhere(
  from: FromBuilder,
  where: WhereNode | undefined,
  scope: ScopeParams,
  prefix: string,
): { sql: string; params: Record<string, unknown> } | null {
  if (!where || (where.kind === 'group' && where.items.length === 0)) return null;
  const compiler = new WhereCompiler(scope, prefix);
  const sql = compiler.node(from, where);
  return { sql, params: compiler.params };
}
