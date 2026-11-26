/* eslint-disable @typescript-eslint/no-unsafe-return -- spec helpers read untyped query specs */
import { CATALOG } from '@/modules/attack-surface-query/catalog/catalog';
import { assertWithinBudget } from '@/modules/attack-surface-query/domain/query-cost';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import { limitsFor } from '@/modules/attack-surface-query/domain/query-limits';
import { parseBatch, validateBatch } from '@/modules/attack-surface-query/domain/query-validator';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import type { ReportOptions } from '../../shared/asq-filters';
import { summaryQueries } from './queries';

// Thursday: weekStart = Monday 2026-11-23 00:00 local.
const now = new Date(2026, 10, 26, 10, 0, 0);
const weekStart = new Date(2026, 10, 23, 0, 0, 0);
const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
const scope: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'report' };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

const all: ReportOptions = {
  startDate: new Date('2026-11-01T00:00:00.000Z'),
  endDate: new Date('2026-11-20T00:00:00.000Z'),
  targetIds: ids(3),
  vulnIds: ids(2),
  minSeverity: 'MEDIUM',
};

function validate(o: ReportOptions, s: QueryScope = scope) {
  const batches = summaryQueries(o, now);
  for (const b of batches) {
    const normalized = validateBatch(CATALOG, parseBatch(b), s, now);
    for (const q of normalized.queries) assertWithinBudget(q, limitsFor('report', 'interactive'));
  }
  return batches;
}

const queriesOf = (o: ReportOptions) => {
  const [a, b] = summaryQueries(o, now);
  return { ...a.queries, ...b.queries } as Record<string, any>;
};
const fields = (spec: any): string[] => (spec.where?.items ?? []).map((i: any) => i.field ?? i.relation);
const aggWhere = (spec: any, name: string) => spec.aggregate[name].where?.items;

describe('summaryQueries', () => {
  it('two consistent batches with the thirteen uniquely named queries', () => {
    const [a, b, ...rest] = summaryQueries({}, now);
    expect(rest).toHaveLength(0);
    expect(a.options).toEqual({ consistent: true });
    expect(b.options).toEqual({ consistent: true });
    expect(Object.keys(a.queries).sort()).toEqual(
      ['targets', 'hosts', 'services', 'severity', 'trend', 'byTarget', 'newFindings'].sort(),
    );
    expect(Object.keys(b.queries).sort()).toEqual(
      ['newDomains', 'newIps', 'newPorts', 'newTech', 'discoveryRisk', 'portRisk'].sort(),
    );
  });

  it('validates with no options, all options and 1000 target ids', () => {
    expect(() => validate({})).not.toThrow();
    expect(() => validate(all)).not.toThrow();
    expect(() => validate({ targetIds: ids(1000) })).not.toThrow();
  });

  it('1001 ids is INVALID_QUERY', () => {
    expect.assertions(2);
    try {
      validate({ targetIds: ids(1001) });
    } catch (e) {
      expect(e).toBeInstanceOf(AsqError);
      expect((e as AsqError).code).toBe('INVALID_QUERY');
    }
  });

  it('without vulnerability.read the batch is PERMISSION_DENIED (403)', () => {
    expect.assertions(2);
    try {
      validate({}, { ...scope, permissions: ['report.read'] });
    } catch (e) {
      expect(e).toBeInstanceOf(AsqError);
      expect((e as AsqError).code).toBe('PERMISSION_DENIED');
    }
  });

  it('totals ignore targets; the change is a count of rows created in last week', () => {
    const q = queriesOf(all);
    for (const name of ['targets', 'hosts', 'services']) {
      expect(q[name].where?.items ?? []).not.toContainEqual(expect.objectContaining({ field: 'host.target.id' }));
      expect(aggWhere(q[name], 'total')).toEqual([
        { field: 'firstSeen', op: 'gte', value: all.startDate!.toISOString() },
        { field: 'firstSeen', op: 'lte', value: all.endDate!.toISOString() },
      ]);
      expect(aggWhere(q[name], 'lastWeek')).toEqual([
        { field: 'firstSeen', op: 'gte', value: lastWeekStart.toISOString() },
        { field: 'firstSeen', op: 'lte', value: weekStart.toISOString() },
      ]);
    }
    expect(q.hosts.where.items).toEqual([{ field: 'kind', op: 'neq', value: 'repository' }]);
  });

  it('without dates the total is a plain count', () => {
    expect(queriesOf({}).targets.aggregate.total).toEqual({ fn: 'count' });
  });

  it('severity: open + targets; current = dates, lastWeek = last week (targets kept)', () => {
    const q = queriesOf(all).severity;
    expect(fields(q)).toEqual(['isOpen', 'host.target.id']);
    expect(q.groupBy).toEqual(['severity']);
    expect(aggWhere(q, 'current')).toHaveLength(2);
    expect(aggWhere(q, 'lastWeek')[0].value).toBe(lastWeekStart.toISOString());
  });

  it('trend / byTarget / newFindings keep today\'s filters', () => {
    const q = queriesOf(all);
    expect(fields(q.trend)).toEqual(['isOpen']); // today: no targets, no dates
    expect(q.trend).toMatchObject({ window: { since: 'now-30d' }, fill: true });
    expect(fields(q.byTarget)).toEqual(['isOpen', 'firstSeen', 'firstSeen', 'host.target.id']);
    expect(q.byTarget.groupBy).toEqual(['host.target.value', 'host.target.type']);
    expect(fields(q.newFindings)).toEqual(['isOpen', 'severity', 'firstSeen', 'firstSeen', 'host.target.id']);
    expect(q.newFindings.limit).toBe(10);
    expect(q.newFindings.orderBy).toEqual([{ field: 'firstSeen', dir: 'desc' }]);
  });

  it('discovery queries cover this week only (weekStart..now), 10 rows each', () => {
    const q = queriesOf(all);
    for (const name of ['newDomains', 'newIps', 'newPorts', 'newTech']) {
      expect(q[name].limit).toBe(10);
      expect(q[name].where.items).toEqual(
        expect.arrayContaining([
          { field: 'firstSeen', op: 'gte', value: weekStart.toISOString() },
          { field: 'firstSeen', op: 'lte', value: now.toISOString() },
        ]),
      );
    }
    expect(q.newDomains.where.items).toContainEqual({ field: 'type', op: 'eq', value: 'DOMAIN' });
    expect(q.newIps.where.items).toContainEqual({ field: 'type', op: 'eq', value: 'IP' });
  });

  it('portRisk is a static relation test through the host to services first seen this week', () => {
    const q = queriesOf({}).portRisk;
    expect(q.from).toBe('vulnerabilities');
    expect(q.where.items).toContainEqual(
      expect.objectContaining({ relation: 'host.services', quantifier: 'some' }),
    );
    expect(q.select).toEqual(expect.arrayContaining(['host.id', 'ports']));
  });
});
