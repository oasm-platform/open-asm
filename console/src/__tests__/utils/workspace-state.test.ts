import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  hashWorkspaceQueryKey,
  setGlobalWorkspaceId,
} from '@/utils/workspaceState';

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { queryKeyHashFn: hashWorkspaceQueryKey } },
  });
}

describe('hashWorkspaceQueryKey', () => {
  afterEach(() => setGlobalWorkspaceId(null));

  it('caches workspace data per workspace', () => {
    const client = createClient();
    setGlobalWorkspaceId('ws-a');
    client.setQueryData(['/api/assets'], 'assets of a');

    setGlobalWorkspaceId('ws-b');
    expect(client.getQueryData(['/api/assets'])).toBeUndefined();
    client.setQueryData(['/api/assets'], 'assets of b');

    setGlobalWorkspaceId('ws-a');
    expect(client.getQueryData(['/api/assets'])).toBe('assets of a');
  });

  it('shares user-level queries across workspaces', () => {
    const client = createClient();
    setGlobalWorkspaceId('ws-a');
    client.setQueryData(['/api/workspaces', { page: 1 }], 'list');
    client.setQueryData(['global', 'dialog'], 'open');

    setGlobalWorkspaceId('ws-b');
    expect(client.getQueryData(['/api/workspaces', { page: 1 }])).toBe('list');
    expect(client.getQueryData(['global', 'dialog'])).toBe('open');
  });

  it('still matches every workspace on a partial-key invalidation', async () => {
    const client = createClient();
    setGlobalWorkspaceId('ws-a');
    client.setQueryData(['/api/assets'], 'a');
    setGlobalWorkspaceId('ws-b');
    client.setQueryData(['/api/assets'], 'b');

    await client.invalidateQueries({ queryKey: ['/api/assets'] });

    const states = client
      .getQueryCache()
      .findAll({ queryKey: ['/api/assets'] })
      .map((query) => query.state.isInvalidated);
    expect(states).toEqual([true, true]);
  });
});
