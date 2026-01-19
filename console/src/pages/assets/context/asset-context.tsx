import { useServerDataTable } from '@/hooks/useServerDataTable';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
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
    hosts?: string[];
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
    hosts?: string[];
    statusCodes?: string[];
  };
  filterHandlers: (key: string, value: string[]) => void;
  generatingAssets: Set<string>;
  startGenerating: (assetId: string) => void;
  stopGenerating: (assetId: string) => void;
  isGenerating: (assetId: string) => boolean;
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
  const [generatingAssets, setGeneratingAssets] = useState<Set<string>>(
    new Set(),
  );

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const ipAddresses = params.getAll('ipAddresses');
  const ports = params.getAll('ports');
  const techs = params.getAll('techs');
  const hosts = params.getAll('hosts');
  const statusCodes = params.getAll('statusCodes');

  const filterHandlers = useCallback(
    (key: string, value: string[]) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('page', '1');
          next.delete(key);
          if (value.length > 0) {
            for (const v of value) next.append(key, v.toString());
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const startGenerating = useCallback((assetId: string) => {
    setGeneratingAssets((prev) => new Set(prev).add(assetId));
  }, []);

  const stopGenerating = useCallback((assetId: string) => {
    setGeneratingAssets((prev) => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  }, []);

  const isGenerating = useCallback(
    (assetId: string) => {
      return generatingAssets.has(assetId);
    },
    [generatingAssets],
  );

  const queryParams = useMemo(
    () => ({
      targetIds: targetId ? [targetId] : undefined,
      value: tableParams.filter,
      limit: tableParams.pageSize,
      ipAddresses: ipAddresses,
      ports: ports,
      techs: techs,
      hosts: hosts,
      statusCodes: statusCodes,
      page: tableParams.page,
      sortBy: tableParams.sortBy,
      sortOrder: tableParams.sortOrder,
    }),
    [
      targetId,
      tableParams.filter,
      tableParams.pageSize,
      tableParams.page,
      tableParams.sortBy,
      tableParams.sortOrder,
      ipAddresses,
      ports,
      techs,
      hosts,
      statusCodes,
    ],
  );

  const queryFilterParams = useMemo(
    () => ({
      targetIds: targetId ? [targetId] : undefined,
      limit: 10,
      page: 1,
    }),
    [targetId],
  );

  const queryOptions = useMemo(
    () => ({
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
          hosts,
          statusCodes,
        ],
      },
    }),
    [
      targetId,
      tableParams.page,
      tableParams.filter,
      tableParams.pageSize,
      tableParams.sortBy,
      tableParams.sortOrder,
      refetchInterval,
      ipAddresses,
      ports,
      techs,
      hosts,
      statusCodes,
    ],
  );

  return (
    <AssetContext.Provider
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
          hosts,
          statusCodes,
        },
        filterHandlers,
        targetId,
        generatingAssets,
        startGenerating,
        stopGenerating,
        isGenerating,
      }}
    >
      {children}
    </AssetContext.Provider>
  );
}

export const useAsset = () => {
  const assetContext = useContext(AssetContext);

  if (!assetContext) {
    throw new Error('useAsset must be used within <AssetContext>');
  }

  return assetContext;
};
