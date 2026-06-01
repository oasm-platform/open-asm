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
import { useNavigate, useSearch } from '@tanstack/react-router';

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
  const search = useSearch({ strict: false }) as Record<string, string | string[] | undefined>;
  const navigate = useNavigate();
  const [generatingAssets, setGeneratingAssets] = useState<Set<string>>(
    new Set(),
  );

  const urlDateFrom = Array.isArray(search.startDate) ? search.startDate[0] : search.startDate;
  const urlDateTo = Array.isArray(search.endDate) ? search.endDate[0] : search.endDate;
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

  const toArray = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) return value;
    if (value) return [value];
    return [];
  };

  const ipAddresses = toArray(search.ipAddresses);
  const ports = toArray(search.ports);
  const techs = toArray(search.techs);
  const hosts = toArray(search.hosts);
  const statusCodes = toArray(search.statusCodes);
  const tlsHosts = toArray(search.tlsHosts);

  const filterHandlers = useCallback(
    (key: string, value: string[]) => {
      navigate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: (prev: any) => {
          const next = { ...prev, page: '1' };
          delete next[key];
          if (value.length > 0) {
            next[key] = value;
          }
          return next;
        },
        replace: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    },
    [navigate],
  );

  const handleDateRangeChange = useCallback(
    (date: DateRange | undefined) => {
      setDateRange(date);
      navigate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: (prev: any) => {
          const next = { ...prev, page: '1' };
          delete next.startDate;
          delete next.endDate;
          if (date?.from) {
            next.startDate = format(date.from, 'yyyy-MM-dd');
          }
          if (date?.to) {
            next.endDate = format(date.to, 'yyyy-MM-dd');
          }
          return next;
        },
        replace: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    },
    [navigate],
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
