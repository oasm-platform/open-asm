import { useServerDataTable } from '@/hooks/useServerDataTable';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { createContext, useCallback, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';

type AssetContextType = ReturnType<typeof useServerDataTable> & {
  selectedWorkspace?: string;
  queryParams: {
    workspaceId: string;
    targetIds?: string[];
    value?: string;
    limit: number;
    ipAddresses?: string[];
    ports?: string[];
    techs?: string[];
    page: number;
    sortBy: string;
    sortOrder: 'ASC' | 'DESC';
  };
  queryOptions: {
    query: {
      refetchInterval?: number;
      queryKey: Array<string[] | number[] | string | number | undefined | null>;
    };
  };
  refetchInterval?: number;
  targetId?: string;
  filterParams: {
    ipAddresses?: string[];
    techs?: string[];
    ports?: string[];
  };
  filterHandlers: (key: string, value: string[]) => void;
};

const AssetContext = createContext<AssetContextType | null>(null);

export default function AssetProvider({
  children,
  targetId,
  refetchInterval,
}: {
  children: React.ReactNode;
  targetId?: string;
  refetchInterval?: number;
}) {
  const [params, setParams] = useSearchParams();

  const { selectedWorkspace } = useWorkspaceSelector();

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const ipAddresses = params.getAll('ipAddresses');
  const ports = params.getAll('ports');
  const techs = params.getAll('techs');

  const filterHandlers = useCallback(
    (key: string, value: string[]) => {
      params.delete(key);
      if (value.length > 0)
        for (const v of value) params.append(key, v.toString());

      setParams(params, { replace: true });
    },
    [params, setParams],
  );

  const queryParams = {
    workspaceId: selectedWorkspace ?? '',
    targetIds: targetId ? [targetId] : undefined,
    value: tableParams.filter,
    limit: tableParams.pageSize,
    ipAddresses: ipAddresses,
    ports: ports,
    techs: techs,
    page: tableParams.page,
    sortBy: tableParams.sortBy,
    sortOrder: tableParams.sortOrder,
  };

  const queryOptions = {
    query: {
      refetchInterval: refetchInterval ?? 30 * 1000,
      queryKey: [
        targetId,
        selectedWorkspace,
        tableParams.page,
        tableParams.filter,
        tableParams.pageSize,
        tableParams.sortBy,
        tableParams.sortOrder,
        ipAddresses,
        ports,
        techs,
      ],
    },
  };

  return (
    <AssetContext
      value={{
        tableHandlers,
        tableParams,
        queryParams,
        queryOptions,
        refetchInterval,
        filterParams: {
          ipAddresses,
          ports,
          techs,
        },
        filterHandlers,
        targetId,
      }}
    >
      {children}
    </AssetContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAsset = () => {
  const assetContext = useContext(AssetContext);

  if (!assetContext) {
    throw new Error('useAsset must be used within <AssetContext>');
  }

  return assetContext;
};
