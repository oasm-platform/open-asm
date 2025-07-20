import { useWorkspacesControllerGetWorkspaces } from "@/services/apis/gen/queries";
import React from "react";
import createState from "./createState"; // adjust path as needed

// Define workspace state type
interface WorkspaceState {
  selectedWorkspaceId: string | null;
}

// Create global workspace state
const useWorkspaceState = createState<WorkspaceState>(
  "workspace",
  { selectedWorkspaceId: null },
  {
    setSelectedWorkspace: (state, id: string | null) => ({
      ...state,
      selectedWorkspaceId: id,
    }),
    clearSelectedWorkspace: (state) => ({
      ...state,
      selectedWorkspaceId: null,
    }),
  }
);

export function useWorkspaceSelector() {
  const {
    data: response,
    isLoading,
    refetch,
  } = useWorkspacesControllerGetWorkspaces({
    limit: 100,
    page: 1,
  });

  const { state, setSelectedWorkspace, clearSelectedWorkspace } =
    useWorkspaceState();

  const handleSelectWorkspace = React.useCallback(
    (id: string) => {
      setSelectedWorkspace(id);
      // Remove window.location.reload() since we're using global state
    },
    [setSelectedWorkspace]
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

      // Update state only if different
      if (state.selectedWorkspaceId !== finalSelectedId) {
        setSelectedWorkspace(finalSelectedId);
      }
    } else if (response?.data && response.data.length === 0) {
      // Clear selection when no workspaces
      if (state.selectedWorkspaceId !== null) {
        clearSelectedWorkspace();
      }
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
    selectedWorkspace: state.selectedWorkspaceId,
    handleSelectWorkspace,
    setSelectedWorkspaceState: setSelectedWorkspace, // Keep for backward compatibility
    refetch,
  };
}
