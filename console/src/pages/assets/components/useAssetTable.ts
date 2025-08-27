import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useAssetTable({
  refetchInterval,
  targetId,
}: {
  refetchInterval?: number;
  targetId?: string;
}) {
  const [params, setParams] = useSearchParams();
  const { selectedWorkspace } = useWorkspaceSelector();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers,
  } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const ipAddresses = params.getAll('ipAddresses');
  const ports = params.getAll('ports');
  const techs = params.getAll('techs');

  const queryParams = {
    workspaceId: selectedWorkspace ?? '',
    targetIds: targetId ? [targetId] : undefined,
    value: filter,
    limit: pageSize,
    ipAddresses: ipAddresses,
    ports: ports,
    techs: techs,
    page,
    sortBy,
    sortOrder,
  };

  const queryOpts = {
    query: {
      refetchInterval: refetchInterval ?? 30 * 1000,
      queryKey: [
        'assets',
        targetId,
        selectedWorkspace,
        page,
        filter,
        pageSize,
        sortBy,
        sortOrder,
        ipAddresses,
        ports,
        techs,
      ],
    },
  };

  const setArrayParam = useCallback(
    (key: string, value: string[]) => {
      params.delete(key);
      params.append(key, value.toString());
      setParams(params, { replace: true });
    },
    [params, setParams],
  );

  return {
    tableHandlers: {
      ...tableHandlers,
      setArrayParam,
    },
    tableParams: { page, filter, pageSize, sortBy, sortOrder },
    queryParams,
    queryOpts,
    selectedWorkspace,
  };
}
