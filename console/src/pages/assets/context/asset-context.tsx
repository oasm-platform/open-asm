import { useServerDataTable } from '@/hooks/useServerDataTable';
import { format } from 'date-fns';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { type DateRange } from 'react-day-picker';
import { useSearchParams } from 'react-router-dom';

export type AssetContextType = ReturnType<typeof useServerDataTable> & {
  queryParams: {
    targetIds?: string[];
    value?: string;
    limit: number;
    ipAddresses?: string[];
    ports?: string[];
    techs?: string[];
    tlsHosts?: string[];
    statusCodes?: string[];
    hosts?: string[];
    startDate?: string;
    endDate?: string;
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
    tlsHosts?: string[];
  };
  filterHandlers: (key: string, value: string[]) => void;
  dateRange: DateRange | undefined;
  setDateRange: (date: DateRange | undefined) => void;
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

  const urlDateFrom = params.get('startDate');
  const urlDateTo = params.get('endDate');
  const initialDateRange =
    urlDateFrom && urlDateTo
      ? { from: new Date(urlDateFrom), to: new Date(urlDateTo) }
      : undefined;
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    initialDateRange,
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
  const tlsHosts = params.getAll('tlsHosts');

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

  const handleDateRangeChange = useCallback(
    (date: DateRange | undefined) => {
      setDateRange(date);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('page', '1');
          next.delete('startDate');
          next.delete('endDate');
          if (date?.from) {
            next.set('startDate', format(date.from, 'yyyy-MM-dd'));
          }
          if (date?.to) {
            next.set('endDate', format(date.to, 'yyyy-MM-dd'));
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
      tlsHosts: tlsHosts,
      startDate: dateRange?.from
        ? format(dateRange.from, 'yyyy-MM-dd')
        : undefined,
      endDate: dateRange?.to
        ? format(dateRange.to, 'yyyy-MM-dd')
        : undefined,
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
      tlsHosts,
      dateRange,
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
          tlsHosts,
          dateRange?.from
            ? format(dateRange.from, 'yyyy-MM-dd')
            : undefined,
          dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
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
      tlsHosts,
      dateRange,
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
          tlsHosts,
        },
        filterHandlers,
        dateRange,
        setDateRange: handleDateRangeChange,
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
