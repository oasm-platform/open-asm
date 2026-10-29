import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useArtifactFoldersControllerGetById,
  useArtifactFoldersControllerGetMany,
} from '@/services/apis/gen/queries';

/** Subfolders of `parentFolderId` (null = root). Keys sit under ['artifacts']. */
export function useFolders(parentFolderId: string | null, enabled = true) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  return useArtifactFoldersControllerGetMany(
    { parentFolderId: parentFolderId ?? undefined },
    {
      query: {
        enabled,
        queryKey: ['artifacts', 'folders', selectedWorkspaceId, parentFolderId],
      },
    },
  );
}

/** Breadcrumb from the top-level folder down to `folderId`; empty at the root. */
export function useFolderPath(folderId: string | null) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data } = useArtifactFoldersControllerGetById(folderId ?? '', {
    query: {
      enabled: Boolean(folderId),
      queryKey: ['artifacts', 'folder', selectedWorkspaceId, folderId],
    },
  });
  return folderId ? (data?.path ?? []) : [];
}
