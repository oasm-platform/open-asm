import { useServerDataTable } from '@/hooks/useServerDataTable';
import { createContext, useCallback, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';

export type AssetContextType = ReturnType<typeof useServerDataTable> & {
  queryParams: {
    targetIds?: string[];
    value?: string;
    limit: number;
    ipAddresses?: string[];
    ports?: string[];
    techs?: string[];
    statusCodes?: string[];
    page: number;
    sortBy: string;
    sortOrder: 'ASC' | 'DESC';
  };
  queryFilterParams: {
    targetIds?: string[];
    value?: string;
    limit: number;
    page: number;
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
    statusCodes?: string[];
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

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const ipAddresses = params.getAll('ipAddresses');
  const ports = params.getAll('ports');
  const techs = params.getAll('techs');
  const statusCodes = params.getAll('statusCodes');

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
    targetIds: targetId ? [targetId] : undefined,
    value: tableParams.filter,
    limit: tableParams.pageSize,
    ipAddresses: ipAddresses,
    ports: ports,
    techs: techs,
    statusCodes: statusCodes,
    page: tableParams.page,
    sortBy: tableParams.sortBy,
    sortOrder: tableParams.sortOrder,
  };

  const queryFilterParams = {
    targetIds: targetId ? [targetId] : undefined,
    limit: 10,
    page: 1,
  };

  const queryOptions = {
    query: {
      refetchInterval: refetchInterval ?? 30 * 1000,
      queryKey: [
        targetId,
        tableParams.page,
        tableParams.filter,
        tableParams.pageSize,
        tableParams.sortBy,
        tableParams.sortOrder,
        ipAddresses,
        ports,
        techs,
        statusCodes,
      ],
    },
  };

  return (
    <AssetContext
      value={{
        queryFilterParams,
        tableHandlers,
        tableParams,
        queryParams,
        queryOptions,
        refetchInterval,
        filterParams: {
          ipAddresses,
          ports,
          techs,
          statusCodes,
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
