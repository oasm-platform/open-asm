import { hashKey, type QueryKey } from '@tanstack/react-query';

/**
 * The selected workspace: the single value behind the `X-Workspace-Id`
 * header, `useWorkspaceState` and the query cache scope, so none of them can
 * lag behind another.
 */
let currentWorkspaceId: string | null = null;
const listeners = new Set<() => void>();

export function setGlobalWorkspaceId(id: string | null) {
  if (id === currentWorkspaceId) return;
  currentWorkspaceId = id;
  for (const listener of listeners) listener();
}

export function getGlobalWorkspaceId() {
  return currentWorkspaceId;
}

export function subscribeGlobalWorkspaceId(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Queries the user shares across workspaces. Every other query is cached per
// workspace: data loaded for one can never show up, or be refetched, in
// another, and switching back finds its own cache.
const UNSCOPED_QUERY_ROOTS = new Set([
  'global',
  '/api/metadata',
  '/api/workspaces',
  'workspaces',
]);

/** `queryKeyHashFn` that puts the selected workspace into every scoped key. */
export function hashWorkspaceQueryKey(queryKey: QueryKey): string {
  const root = queryKey[0];
  if (
    !currentWorkspaceId ||
    (typeof root === 'string' && UNSCOPED_QUERY_ROOTS.has(root))
  ) {
    return hashKey(queryKey);
  }
  return hashKey([{ workspace: currentWorkspaceId }, ...queryKey]);
}
