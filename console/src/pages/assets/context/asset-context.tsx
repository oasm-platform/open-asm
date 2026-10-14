import { useServerDataTable } from '@/hooks/useServerDataTable';
import { format } from 'date-fns';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type DateRange } from 'react-day-picker';
import { decodeFilter, encodeFilter, type Filter } from '@/components/filter-builder/filter-model';
import { LEGACY_FILTER_KEYS, legacyToFilter } from '../legacy-filter';
import { useNavigate, useSearch } from '@tanstack/react-router';

export type AssetContextType = ReturnType<typeof useServerDataTable> & {
  queryParams: {
    targetIds?: string[];
    value?: string;
    limit: number;
    filter?: string;
    startDate?: string;
    endDate?: string;
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
  appliedFilter?: Filter;
  setAppliedFilter: (f?: Filter) => void;
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
  // Derived from the URL (not useState) so deep links with a single bound —
  // e.g. the dashboard TLS card navigates with only startDate or only endDate —
  // still produce a working filter. A DateRange with one bound is a valid range.
  const dateRange: DateRange | undefined =
    urlDateFrom || urlDateTo
      ? {
          from: urlDateFrom ? new Date(urlDateFrom) : undefined,
          to: urlDateTo ? new Date(urlDateTo) : undefined,
        }
      : undefined;

  const { tableParams, tableHandlers } = useServerDataTable({
    defaultSortBy: 'value',
    defaultSortOrder: 'ASC',
  });

  const where = typeof search.where === 'string' ? search.where : undefined;
  const appliedFilter = useMemo(() => decodeFilter(where), [where]);

  // One-time migration of old links (?hosts=…&ports=…) into the tree.
  useEffect(() => {
    const legacy = legacyToFilter(search);
    if (!legacy) return;
    const merged: Filter = { logic: 'and', items: [...(appliedFilter?.items ?? []), ...legacy.items] };
    navigate({
      search: ((prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, where: encodeFilter(merged) };
        for (const k of LEGACY_FILTER_KEYS) delete next[k];
        return next;
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      replace: true,
    });
  }, [search, appliedFilter, navigate]);

  const setAppliedFilter = useCallback(
    (f?: Filter) => {
      navigate({
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          page: 1,
          where: encodeFilter(f),
          // A non-empty tree replaces the free-text search (the bar shows the tree instead).
          filter: f?.items.length ? '' : prev.filter,
        })) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        replace: true,
      });
    },
    [navigate],
  );

  const handleDateRangeChange = useCallback(
    (date: DateRange | undefined) => {
      navigate({
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          page: 1,
          startDate: date?.from ? format(date.from, 'yyyy-MM-dd') : undefined,
          endDate: date?.to ? format(date.to, 'yyyy-MM-dd') : undefined,
        })) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        replace: true,
      });
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
      filter: where,
      startDate: urlDateFrom,
      endDate: urlDateTo,
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
      where,
      urlDateFrom,
      urlDateTo,
    ],
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
          where,
          urlDateFrom,
          urlDateTo,
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
      where,
      urlDateFrom,
      urlDateTo,
    ],
  );

  return (
    <AssetContext.Provider
      value={{
        tableHandlers,
        tableParams,
        queryParams,
        queryOptions,
        refetchInterval,
        appliedFilter,
        setAppliedFilter,
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
