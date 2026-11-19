import { AsqError } from '../domain/query-errors';
import { limitsFor } from '../domain/query-limits';
import { mapLimited, Semaphore } from './concurrency';
import { mapPgError } from './pg-errors';
import { assertPlanWithinLimits, readPlan } from './preflight';
import { cursorKeysOf, shapeRow } from './result-shaper';

describe('shapeRow', () => {
  const shape = {
    columns: [
      { alias: 'c_id', path: ['id'], type: 'uuid' as const },
      { alias: 'c0', path: ['port'], type: 'int' as const },
      { alias: 'c1', path: ['host', 'value'], type: 'text' as const },
      { alias: 'c2', path: ['http', 'title'], type: 'text' as const },
      { alias: 'c3', path: ['firstSeen'], type: 'timestamp' as const },
    ],
    relations: [
      { path: ['host'], idAlias: 'r0' },
      { path: ['http'], idAlias: 'r1' },
    ],
  };

  it('nests dot paths, coerces types and nulls an absent relation', () => {
    const row = shapeRow(
      { c_id: 'id1', c0: '443', c1: 'a.example.com', c2: null, c3: new Date('2026-11-16T03:12:00Z'), r0: 'h1', r1: null },
      shape,
      100,
      () => undefined,
    );
    expect(row).toEqual({
      id: 'id1',
      port: 443,
      host: { value: 'a.example.com' },
      http: null,
      firstSeen: '2026-11-16T03:12:00.000Z',
    });
  });

  it('cuts long strings and reports it', () => {
    let cut = false;
    const row = shapeRow({ c_id: 'x', c1: 'a'.repeat(20), r0: 'h' }, { columns: [shape.columns[2]], relations: [shape.relations[0]] }, 5, () => {
      cut = true;
    });
    expect(row).toEqual({ host: { value: 'aaaaa…' } });
    expect(cut).toBe(true);
  });

  it('reads cursor keys from the hidden sort columns', () => {
    expect(
      cursorKeysOf({ s0: new Date('2026-11-16T00:00:00Z'), s1: '12', s2: 'id9' }, [
        { alias: 's0', cast: 'timestamptz' },
        { alias: 's1', cast: 'int8' },
        { alias: 's2', cast: 'uuid' },
      ]),
    ).toEqual(['2026-11-16T00:00:00.000Z', 12, 'id9']);
  });
});

describe('preflight', () => {
  const explain = (plan: unknown) => [{ 'QUERY PLAN': [{ Plan: plan }] }];
  const limits = limitsFor('agent', 'interactive');

  it('reads the total cost and the biggest sort input', () => {
    const estimate = readPlan(
      explain({
        'Node Type': 'Limit',
        'Total Cost': 1234.5,
        Plans: [{ 'Node Type': 'Sort', 'Plan Rows': 51, Plans: [{ 'Node Type': 'Seq Scan', 'Plan Rows': 900000 }] }],
      }),
    );
    expect(estimate).toEqual({ totalCost: 1234.5, sortRows: 900000 });
  });

  it('refuses an expensive plan and a big unindexed sort', () => {
    expect(() => assertPlanWithinLimits('q', { totalCost: limits.maxPlannerCost + 1, sortRows: 0 }, limits, false)).toThrow(
      expect.objectContaining({ code: 'COST_EXCEEDED' }),
    );
    expect(() => assertPlanWithinLimits('q', { totalCost: 10, sortRows: limits.maxSortRows + 1 }, limits, true)).toThrow(AsqError);
    expect(() => assertPlanWithinLimits('q', { totalCost: 10, sortRows: limits.maxSortRows + 1 }, limits, false)).not.toThrow();
  });
});

describe('mapPgError', () => {
  it.each([
    ['57014', 'QUERY_TIMEOUT', false],
    ['53300', 'BUSY', false],
    ['25006', 'INTERNAL', true],
    ['42703', 'INTERNAL', true],
    ['22P02', 'INTERNAL', true],
    ['XX000', 'INTERNAL', false],
  ])('maps %s to %s', (code, expected, bug) => {
    const mapped = mapPgError(Object.assign(new Error('column "secret" of relation users'), { code }), 5000);
    expect(mapped.error.code).toBe(expected);
    expect(mapped.bug).toBe(bug);
    expect(mapped.error.message).not.toMatch(/secret|users/);
  });
});

describe('Semaphore', () => {
  it('caps concurrency and hands slots to waiters', async () => {
    const sem = new Semaphore(2, 1000);
    const a = await sem.acquire();
    await sem.acquire();
    const waiting = sem.acquire();
    expect(sem.inUse).toBe(2);
    a();
    const c = await waiting;
    expect(sem.inUse).toBe(2);
    c();
    expect(sem.inUse).toBe(1);
  });

  it('throws BUSY after the wait', async () => {
    const sem = new Semaphore(1, 10);
    await sem.acquire();
    await expect(sem.acquire()).rejects.toMatchObject({ code: 'BUSY' });
  });

  it('ignores a double release', async () => {
    const sem = new Semaphore(1, 10);
    const release = await sem.acquire();
    release();
    release();
    expect(sem.inUse).toBe(0);
  });
});

describe('mapLimited', () => {
  it('keeps order and the limit', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimited([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
