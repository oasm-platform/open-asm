import { useWorkspacesControllerGetWorkspaces } from "@/services/apis/gen/queries";
import React from "react";

const LOCAL_STORAGE_KEY = "workspace_id";

export function useWorkspaceSelector() {
  const { data: response, isLoading } = useWorkspacesControllerGetWorkspaces({
    limit: 100,
    page: 1,
  });

  const [selectedWorkspace, setSelectedWorkspaceState] = React.useState<
    string | null
  >(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LOCAL_STORAGE_KEY);
    }
    return null;
  });

  const handleSelectWorkspace = React.useCallback((id: string) => {
    setSelectedWorkspaceState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, id);
    }
  }, []);

  React.useEffect(() => {
    if (response?.data && response.data.length > 0) {
      const workspaceIds = response.data.map((ws) => ws.id);
      const localStorageId =
        typeof window !== "undefined"
          ? localStorage.getItem(LOCAL_STORAGE_KEY)
          : null;

      let finalSelectedId: string | null = null;

      if (localStorageId && workspaceIds.includes(localStorageId)) {
        finalSelectedId = localStorageId;
      } else {
        finalSelectedId = response.data[0].id;
      }

      if (selectedWorkspace !== finalSelectedId) {
        setSelectedWorkspaceState(finalSelectedId);
      }

      if (
        typeof window !== "undefined" &&
        localStorage.getItem(LOCAL_STORAGE_KEY) !== finalSelectedId
      ) {
        localStorage.setItem(LOCAL_STORAGE_KEY, finalSelectedId);
      }
    } else if (response?.data && response.data.length === 0) {
      if (selectedWorkspace !== null) {
        setSelectedWorkspaceState(null);
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, [response]);

  return {
    workspaces: response?.data || [],
    isLoading,
    selectedWorkspace,
    handleSelectWorkspace,
  };
}
