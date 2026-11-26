import { CATALOG } from '@/modules/attack-surface-query/catalog/catalog';
import { parseBatch, validateBatch } from '@/modules/attack-surface-query/domain/query-validator';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { findingFilters, inPeriod, open } from './asq-filters';

const from = new Date('2026-01-01T00:00:00.000Z');
const to = new Date('2026-02-01T00:00:00.000Z');

describe('findingFilters', () => {
  it('adds nothing without options or flags', () => {
    expect(findingFilters({}, { dates: true, targets: true, vulns: true, severity: true })).toEqual([]);
    expect(findingFilters({ startDate: from }, {})).toEqual([]);
  });

  it('dates: gte/lte on firstSeen as ISO strings, each end alone', () => {
    expect(findingFilters({ startDate: from, endDate: to }, { dates: true })).toEqual([
      { field: 'firstSeen', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
      { field: 'firstSeen', op: 'lte', value: '2026-02-01T00:00:00.000Z' },
    ]);
    expect(findingFilters({ startDate: from }, { dates: true })).toEqual([
      { field: 'firstSeen', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(findingFilters({ endDate: to }, { dates: true })).toEqual([
      { field: 'firstSeen', op: 'lte', value: '2026-02-01T00:00:00.000Z' },
    ]);
  });

  it('targets: in on the host target id; empty list adds nothing', () => {
    expect(findingFilters({ targetIds: ['t1', 't2'] }, { targets: true })).toEqual([
      { field: 'host.target.id', op: 'in', value: ['t1', 't2'] },
    ]);
    expect(findingFilters({ targetIds: [] }, { targets: true })).toEqual([]);
  });

  it('vulns: in on id; empty list adds nothing', () => {
    expect(findingFilters({ vulnIds: ['v1'] }, { vulns: true })).toEqual([
      { field: 'id', op: 'in', value: ['v1'] },
    ]);
    expect(findingFilters({ vulnIds: [] }, { vulns: true })).toEqual([]);
  });

  it('severity: minSeverity and everything above it', () => {
    expect(findingFilters({ minSeverity: 'HIGH' }, { severity: true })).toEqual([
      { field: 'severity', op: 'in', value: ['high', 'critical'] },
    ]);
    expect(findingFilters({ minSeverity: 'INFO' }, { severity: true })).toEqual([
      { field: 'severity', op: 'in', value: ['info', 'low', 'medium', 'high', 'critical'] },
    ]);
  });

  it('combines flags in a fixed order', () => {
    const items = findingFilters(
      { startDate: from, targetIds: ['t1'], vulnIds: ['v1'], minSeverity: 'CRITICAL' },
      { dates: true, targets: true, vulns: true, severity: true },
    );
    expect(items.map((i) => (i as { field: string }).field)).toEqual([
      'firstSeen',
      'host.target.id',
      'id',
      'severity',
    ]);
  });

  it('only applies the flags asked for', () => {
    expect(
      findingFilters({ startDate: from, targetIds: ['t1'] }, { targets: true }),
    ).toEqual([{ field: 'host.target.id', op: 'in', value: ['t1'] }]);
  });
});

describe('open / inPeriod', () => {
  it('open is the isOpen condition', () => {
    expect(open).toEqual({ field: 'isOpen', op: 'eq', value: 'true' });
  });

  it('inPeriod is gte + lte on the field', () => {
    expect(inPeriod('fixedAt', from, to)).toEqual([
      { field: 'fixedAt', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
      { field: 'fixedAt', op: 'lte', value: '2026-02-01T00:00:00.000Z' },
    ]);
  });
});

describe('items are accepted by the ASQ validator', () => {
  it('validates every filter on vulnerabilities', () => {
    const uuid = '8d2c1f6e-4c7a-4b7e-9a51-0f3a9a1c2b3d';
    const items = [
      open,
      ...findingFilters(
        { startDate: from, endDate: to, targetIds: [uuid], vulnIds: [uuid], minSeverity: 'HIGH' },
        { dates: true, targets: true, vulns: true, severity: true },
      ),
      ...inPeriod('fixedAt', from, to),
    ];
    const scope: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'report' };
    const batch = parseBatch({
      queries: { q: { from: 'vulnerabilities', select: ['name'], where: { logic: 'and', items } } },
    });
    expect(() => validateBatch(CATALOG, batch, scope, new Date('2026-03-01T00:00:00Z'))).not.toThrow();
  });
});
