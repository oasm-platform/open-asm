import { limitsFor } from './query-limits';

describe('limitsFor', () => {
  it('gives the in-process report caller its own sync profile', () => {
    const limits = limitsFor('report', 'interactive');
    expect(limits).toMatchObject({
      maxLimit: 10_000,
      maxStringLength: 100_000,
      statementTimeoutMs: 30_000,
      batchBudgetMs: 60_000,
      costBudget: 60_000,
      maxPlannerCost: 4_000_000,
      maxSortRows: 5_000_000,
      maxResponseBytes: 32 * 1024 * 1024,
      allowHeavy: true,
      filter: { conditions: 50, depth: 4, values: 1000 },
    });
  });

  it('keeps agent and mcp on the agent profile', () => {
    for (const caller of ['agent', 'mcp'] as const) {
      expect(limitsFor(caller, 'interactive')).toBe(limitsFor('agent', 'interactive'));
      expect(limitsFor(caller, 'interactive').allowHeavy).toBe(false);
    }
  });

  it('keeps the HTTP profiles', () => {
    expect(limitsFor('http', 'interactive').maxLimit).toBe(1000);
    expect(limitsFor('http', 'report').maxLimit).toBe(50_000);
  });
});
