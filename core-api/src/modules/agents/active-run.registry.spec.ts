import { ActiveRunRegistry } from './active-run.registry';

describe('ActiveRunRegistry', () => {
  let runs: ActiveRunRegistry;

  beforeEach(() => {
    runs = new ActiveRunRegistry();
  });

  it('tracks a run until it is cleared', () => {
    const run = new AbortController();
    runs.register('c1', run);

    expect(runs.isActive('c1')).toBe(true);
    runs.clear('c1', run);
    expect(runs.isActive('c1')).toBe(false);
  });

  it('aborts the older run when a newer one registers on the same conversation', () => {
    const older = new AbortController();
    const newer = new AbortController();
    runs.register('c1', older);
    runs.register('c1', newer);

    expect(older.signal.aborted).toBe(true);
    expect(newer.signal.aborted).toBe(false);
  });

  it('ignores a clear from a run that was already superseded', () => {
    const older = new AbortController();
    const newer = new AbortController();
    runs.register('c1', older);
    runs.register('c1', newer);

    runs.clear('c1', older);

    expect(runs.isActive('c1')).toBe(true);
  });

  it('aborts the active run once, and keeps it registered until it clears itself', () => {
    const run = new AbortController();
    runs.register('c1', run);

    expect(runs.abort('c1')).toBe(true);
    expect(run.signal.aborted).toBe(true);
    expect(runs.isActive('c1')).toBe(true);
    expect(runs.abort('c1')).toBe(false);
    expect(runs.abort('unknown')).toBe(false);
  });
});
