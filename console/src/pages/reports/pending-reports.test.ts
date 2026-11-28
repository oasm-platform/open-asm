import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addPendingReport,
  PENDING_EXPIRES_AFTER_MS,
  settlePendingReports,
} from './pending-reports';

// The store is module state; read it back through its own subscription.
async function pendingOf(workspaceId: string) {
  const { usePendingReports } = await import('./pending-reports');
  const { renderHook } = await import('@testing-library/react');
  return renderHook(() => usePendingReports(workspaceId)).result.current;
}

describe('pending reports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    settlePendingReports('w1', Number.MAX_SAFE_INTEGER);
    settlePendingReports('w2', Number.MAX_SAFE_INTEGER);
  });

  it('adds an entry outside a secure context, where crypto.randomUUID does not exist', async () => {
    // Plain http on a LAN address: browsers leave randomUUID undefined.
    vi.stubGlobal('crypto', {});

    expect(() =>
      addPendingReport({ workspaceId: 'w1', template: 'SUMMARY', total: 2 }),
    ).not.toThrow();
    expect(await pendingOf('w1')).toHaveLength(1);
  });

  it('settles entries in queue order as the list grows', async () => {
    addPendingReport({ workspaceId: 'w1', template: 'SUMMARY', total: 2 });
    addPendingReport({ workspaceId: 'w1', template: 'VULNERABILITY', total: 2 });

    settlePendingReports('w1', 3);
    const left = await pendingOf('w1');
    expect(left.map((entry) => entry.template)).toEqual(['VULNERABILITY']);

    settlePendingReports('w1', 4);
    expect(await pendingOf('w1')).toHaveLength(0);
  });

  it('keeps entries of other workspaces and expires stale ones', async () => {
    addPendingReport({ workspaceId: 'w1', template: 'SUMMARY', total: 0 });
    addPendingReport({ workspaceId: 'w2', template: 'SUMMARY', total: 0 });

    settlePendingReports('w1', 0, Date.now() + PENDING_EXPIRES_AFTER_MS + 1);

    expect(await pendingOf('w1')).toHaveLength(0);
    expect(await pendingOf('w2')).toHaveLength(1);
  });
});
