import type { DataSource } from 'typeorm';
import { findFreshRuns, freshRunSql, isFresh, runKey } from './fresh-runs';

describe('findFreshRuns', () => {
  const dataSourceReturning = (rows: unknown[]) => {
    const query = jest.fn().mockResolvedValue(rows);
    return { dataSource: { query } as unknown as DataSource, query };
  };

  it('does not query when no row carries a run', async () => {
    const { dataSource, query } = dataSourceReturning([]);

    const fresh = await findFreshRuns(dataSource, [
      { jobHistoryId: null, targetId: 't-1' },
      { jobHistoryId: 'run-1', targetId: undefined },
    ]);

    expect(fresh.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('asks once per distinct (run, target) pair', async () => {
    const { dataSource, query } = dataSourceReturning([
      { jobHistoryId: 'run-1', targetId: 't-1' },
    ]);

    const fresh = await findFreshRuns(dataSource, [
      { jobHistoryId: 'run-1', targetId: 't-1' },
      { jobHistoryId: 'run-1', targetId: 't-1' },
      { jobHistoryId: 'run-1', targetId: 't-2' },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([
      ['run-1', 'run-1'],
      ['t-1', 't-2'],
    ]);
    expect(isFresh(fresh, { jobHistoryId: 'run-1', targetId: 't-1' })).toBe(
      true,
    );
    expect(isFresh(fresh, { jobHistoryId: 'run-1', targetId: 't-2' })).toBe(
      false,
    );
  });

  it('only counts finished runs not followed by a finished run of the same workflow on the target', async () => {
    const { dataSource, query } = dataSourceReturning([]);

    await findFreshRuns(dataSource, [{ jobHistoryId: 'run-1', targetId: 't-1' }]);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('run."isCompleted" = true');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('later."workflowId" = run."workflowId"');
    expect(sql).toContain('later."isCompleted" = true');
    expect(sql).toContain('later."createdAt" > run."createdAt"');
    expect(sql).toContain(
      `later.scope -> 'targetIds' @> jsonb_build_array((p."targetId")::text)`,
    );
  });

  it('shares one predicate with the list filter', () => {
    const sql = freshRunSql('asset_service."jobHistoryId"', 'asset."targetId"');
    expect(sql).toContain('run.id = asset_service."jobHistoryId"');
    expect(sql).toContain('jsonb_build_array((asset."targetId")::text)');
  });

  it('never marks a row without provenance as fresh', () => {
    const fresh = new Set([runKey('run-1', 't-1')]);
    expect(isFresh(fresh, { jobHistoryId: null, targetId: 't-1' })).toBe(false);
    expect(isFresh(fresh, { jobHistoryId: 'run-1', targetId: null })).toBe(
      false,
    );
  });
});
