import {
  useToolsControllerGetInstalledTools,
  useToolsControllerGetManyTools,
  useToolsControllerInstallTool,
  type Tool,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '../project-utils';

/**
 * Tools for a pipeline picker: the installed ones it can add, plus the rest of
 * the catalog so a tool can be installed without leaving the picker.
 */
export function usePipelineTools({ enabled = true }: { enabled?: boolean } = {}) {
  const installedQuery = useToolsControllerGetInstalledTools();
  const catalogQuery = useToolsControllerGetManyTools(
    { limit: 100 },
    { query: { enabled } },
  );

  const tools = useMemo(
    () => installedQuery.data?.data ?? [],
    [installedQuery.data?.data],
  );
  const installableTools = useMemo(() => {
    const installedIds = new Set(tools.map((tool) => tool.id));
    return (catalogQuery.data?.data ?? []).filter(
      (tool) => !tool.isInstalled && !installedIds.has(tool.id),
    );
  }, [tools, catalogQuery.data?.data]);

  return { tools, installableTools, isLoading: installedQuery.isLoading };
}

/**
 * Not-installed tools matching `search`, searched on the server so it reaches
 * past the first page of the catalog. Idle while `search` is empty.
 */
export function useInstallableToolSearch(
  search: string,
  installedIds: ReadonlySet<string>,
) {
  const query = useToolsControllerGetManyTools(
    { limit: 100, search },
    { query: { enabled: !!search } },
  );
  const results = useMemo(
    () =>
      (query.data?.data ?? []).filter(
        (tool) => !tool.isInstalled && !installedIds.has(tool.id),
      ),
    [query.data?.data, installedIds],
  );
  return { results, isFetching: query.isFetching };
}

/**
 * Installs a tool in the current workspace and refetches every tools query,
 * so the picker moves it into the installed list. Rejects on failure after
 * showing the error.
 */
export function useInstallPipelineTool() {
  const queryClient = useQueryClient();
  const { mutateAsync } = useToolsControllerInstallTool();

  return useCallback(
    async (tool: Tool) => {
      // Connector names are lowercase slugs (gitleaks); capitalize for display.
      const name = tool.name.charAt(0).toUpperCase() + tool.name.slice(1);
      try {
        await mutateAsync({ data: { toolId: tool.id } });
      } catch (error) {
        toast.error(apiErrorMessage(error, `Failed to install ${name}`));
        throw error;
      }
      await queryClient.invalidateQueries({
        predicate: (query) =>
          String(query.queryKey[0] ?? '').startsWith('/api/tools'),
      });
      toast.success(`${name} installed`);
    },
    [mutateAsync, queryClient],
  );
}
