import { useSession } from '@/utils/authClient';
import {
  getWorkspacesControllerGetWorkspacesQueryOptions,
  useWorkspacesControllerGetWorkspaces,
} from '@/services/apis/gen/queries';
import {
  getGlobalWorkspaceId,
  setGlobalWorkspaceId,
  subscribeGlobalWorkspaceId,
} from '@/utils/workspaceState';
import React from 'react';

/** Params of the workspace list every picker reads (and login prefetches). */
export const WORKSPACE_LIST_PARAMS = {
  limit: 100,
  page: 1,
  isArchived: false,
};
// The flows that change the list (create, delete, accept invite) refetch it.
const WORKSPACE_LIST_STALE_TIME = 30_000;

export const getWorkspaceListQueryOptions = () =>
  getWorkspacesControllerGetWorkspacesQueryOptions(WORKSPACE_LIST_PARAMS, {
    query: { staleTime: WORKSPACE_LIST_STALE_TIME },
  });

// The workspace this browser selected last, restored on reload. Not the `wid`
// cookie: the API sets that one HttpOnly, so scripts can neither read nor
// overwrite it.
const LAST_WORKSPACE_KEY = 'last-workspace-id';

function readLastWorkspace() {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function writeLastWorkspace(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_WORKSPACE_KEY, id);
    else localStorage.removeItem(LAST_WORKSPACE_KEY);
  } catch {
    // localStorage not available: a reload starts on the first workspace.
  }
}

/**
 * Switches this tab to a workspace. Workspace-scoped queries are cached per
 * workspace (see hashWorkspaceQueryKey), so nothing needs invalidating.
 */
export function selectWorkspace(id: string) {
  setGlobalWorkspaceId(id);
  writeLastWorkspace(id);
}

const getSelectedWorkspaceId = () => getGlobalWorkspaceId() ?? '';

/** The selected workspace id; '' while none is selected. */
export function useWorkspaceState() {
  const selectedWorkspaceId = React.useSyncExternalStore(
    subscribeGlobalWorkspaceId,
    getSelectedWorkspaceId,
  );
  return { state: { selectedWorkspaceId } };
}

function useWorkspaceList() {
  const { data: session } = useSession();
  return useWorkspacesControllerGetWorkspaces(WORKSPACE_LIST_PARAMS, {
    query: {
      enabled: Boolean(session?.user),
      staleTime: WORKSPACE_LIST_STALE_TIME,
    },
  });
}

/**
 * Keeps the selection valid against the workspace list: the current one while
 * it still exists, else the last one selected (reload), else the first.
 * Mounted once, at the root.
 */
export function useWorkspaceSync() {
  const { data: response } = useWorkspaceList();

  React.useEffect(() => {
    const workspaces = response?.data;
    if (!workspaces) return;
    if (workspaces.length === 0) {
      setGlobalWorkspaceId(null);
      writeLastWorkspace(null);
      return;
    }

    const ids = workspaces.map((ws) => ws.id);
    const current = getGlobalWorkspaceId();
    if (current && ids.includes(current)) return;
    const last = readLastWorkspace();
    selectWorkspace(last && ids.includes(last) ? last : ids[0]);
  }, [response]);
}

export function useWorkspaceSelector() {
  const { data: response, isLoading, refetch } = useWorkspaceList();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  return {
    workspaces: response?.data || [],
    isLoading,
    selectedWorkspace: selectedWorkspaceId,
    handleSelectWorkspace: selectWorkspace,
    refetch,
  };
}
