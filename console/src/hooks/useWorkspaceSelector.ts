import { useWorkspacesControllerGetWorkspaces } from '@/services/apis/gen/queries';
import { setGlobalWorkspaceId } from '@/utils/workspaceState';
import React from 'react';
import createState from './createState'; // adjust path as needed

// Define workspace state type
interface WorkspaceState {
  selectedWorkspaceId: string;
}

// Create global workspace state
const useWorkspaceState = createState<WorkspaceState>(
  'workspace',
  { selectedWorkspaceId: '' },
  {
    setSelectedWorkspace: (state, id) => {
      return typeof id === 'string'
        ? {
            ...state,
            selectedWorkspaceId: id,
          }
        : state;
    },
    clearSelectedWorkspace: (state) => ({
      ...state,
      selectedWorkspaceId: '',
    }),
  },
);

export function useWorkspaceSelector() {
  const {
    data: response,
    isLoading,
    refetch,
  } = useWorkspacesControllerGetWorkspaces(
    {
      limit: 100,
      page: 1,
      isArchived: false,
    },
    {
      query: {
        queryKey: ['workspaces'],
      },
    },
  );

  const { state, setSelectedWorkspace, clearSelectedWorkspace } =
    useWorkspaceState();

  const handleSelectWorkspace = React.useCallback(
    (id: string) => {
      setSelectedWorkspace(id);
      setGlobalWorkspaceId(id); // Always set the global workspace ID when manually selecting
    },
    [setSelectedWorkspace],
  );

  // Auto-select workspace logic
  React.useEffect(() => {
    if (response?.data && response.data.length > 0) {
      const workspaceIds = response.data.map((ws) => ws.id);
      const currentSelectedId = state.selectedWorkspaceId;

      let finalSelectedId: string | null = null;

      // If current selected workspace still exists, keep it
      if (currentSelectedId && workspaceIds.includes(currentSelectedId)) {
        finalSelectedId = currentSelectedId;
      } else {
        // Otherwise, select the first workspace
        finalSelectedId = response.data[0].id;
      }

      // Always update the global workspace ID to ensure it's in sync
      setGlobalWorkspaceId(finalSelectedId);

      // Update state only if different
      if (state.selectedWorkspaceId !== finalSelectedId) {
        setSelectedWorkspace(finalSelectedId);
      }
    } else if (response?.data && response.data.length === 0) {
      // Clear selection when no workspaces
      clearSelectedWorkspace();
      setGlobalWorkspaceId(null);
    }
  }, [
    response,
    state.selectedWorkspaceId,
    setSelectedWorkspace,
    clearSelectedWorkspace,
  ]);

  return {
    workspaces: response?.data || [],
    isLoading,
    selectedWorkspace: state.selectedWorkspaceId || null, // Return null if empty string
    handleSelectWorkspace,
    setSelectedWorkspaceState: setSelectedWorkspace, // Keep for backward compatibility
    refetch,
  };
}
