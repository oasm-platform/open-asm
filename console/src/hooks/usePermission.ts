import { useWorkspacesControllerGetCurrentPermission } from '@/services/apis/gen/queries';
import { useCallback, useMemo } from 'react';
import { useWorkspaceState } from './useWorkspaceSelector';

/**
 * Reads the permission keys of the current user in the selected workspace
 * (GET /api/workspaces/current-permission).
 *
 * The workspace is resolved from the X-Workspace-Id header, which the axios
 * client injects from the globally selected workspace. The query is disabled
 * until a workspace is actually selected, and is invalidated automatically on
 * workspace switch (see useWorkspaceSelector#handleSelectWorkspace).
 *
 * @example
 * const { permissions, isOwner, hasPermission } = usePermission();
 * if (isOwner) { /* render owner UI *\/ }
 * if (hasPermission('target.read')) { /* render action *\/ }
 */
export function usePermission() {
  const { state } = useWorkspaceState();

  const query = useWorkspacesControllerGetCurrentPermission({
    query: {
      enabled: Boolean(state.selectedWorkspaceId),
      // staleTime 0 (default): refetch on window focus, remount and workspace
      // switch so permission changes by the admin show up without a reload.
    },
  });

  const permissions = useMemo(
    () => query.data?.currentPermission ?? [],
    [query.data],
  );

  const hasPermission = useCallback(
    (key: string) => {
      // '*' wildcard (Admin/Owner) satisfies every permission key.
      if (permissions.includes('*')) return true;
      if (permissions.includes(key)) return true;
      // {domain}.write implies {domain}.read
      if (key.endsWith('.read')) {
        return permissions.includes(`${key.slice(0, -'.read'.length)}.write`);
      }
      return false;
    },
    [permissions],
  );

  return {
    /** Union of permission keys across the user's groups in the selected workspace. */
    permissions,
    /** True when the user holds the Admin wildcard ('*') — equivalent to workspace owner. */
    isOwner: permissions.includes('*'),
    /** Check whether the user holds a given permission key. */
    hasPermission,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
