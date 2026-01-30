import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Custom hook for server-side data table with pagination, sorting, and filtering
 * Supports both URL parameter synchronization and internal state management
 */
export function useServerDataTable({
  /**
   * Default page number for pagination (default: 1)
   */
  defaultPage = 1,
  /**
   * Default number of items per page (default: 10)
   */
  defaultPageSize = 10,
  /**
   * Default field to sort by (default: "createdAt")
   */
  defaultSortBy = 'createdAt',
  /**
   * Default sort order - either ASC (ascending) or DESC (descending) (default: "DESC")
   */
  defaultSortOrder = 'DESC' as 'ASC' | 'DESC',
  /**
   * Whether to update URL search parameters when table state changes (default: true)
   * If true, table parameters will be synced with URL query params
   * If false, only internal state will be maintained
   */
  isUpdateSearchQueryParam = true,
} = {}) {
  const [urlParams, setUrlParams] = useSearchParams();
  const [internalParams, setInternalParams] = useState(() => ({
    page: defaultPage,
    pageSize: defaultPageSize,
    sortBy: defaultSortBy,
    sortOrder: defaultSortOrder,
    filter: '',
  }));
  const getNumberParam = (key: string, fallback: number) => {
    const val = parseInt(urlParams.get(key) || '');
    return isNaN(val) ? fallback : val;
  };

  const page = isUpdateSearchQueryParam
    ? getNumberParam('page', defaultPage)
    : internalParams.page;
  const pageSize = isUpdateSearchQueryParam
    ? getNumberParam('pageSize', defaultPageSize)
    : internalParams.pageSize;
  const sortBy = isUpdateSearchQueryParam
    ? urlParams.get('sortBy') || defaultSortBy
    : internalParams.sortBy;
  const sortOrder = isUpdateSearchQueryParam
    ? (urlParams.get('sortOrder') as 'ASC' | 'DESC') || defaultSortOrder
    : internalParams.sortOrder;
  const filter = isUpdateSearchQueryParam
    ? urlParams.get('filter') || ''
    : internalParams.filter;

  const setParams = useCallback(
    (newParams: Partial<typeof internalParams>) => {
      if (isUpdateSearchQueryParam) {
        setUrlParams(
          (prev) => {
            const next = new URLSearchParams(prev);

            Object.entries(newParams).forEach(([key, value]) => {
              if (value === undefined || value === null || value === '') {
                next.delete(key);
              } else {
                next.set(key, String(value));
              }
            });

            return next;
          },
          { replace: true },
        );
      } else {
        setInternalParams((prev) => ({
          ...prev,
          ...newParams,
        }));
      }
    },
    [isUpdateSearchQueryParam, setUrlParams],
  );

  return {
    tableParams: {
      page,
      pageSize,
      sortBy,
      sortOrder,
      filter,
    },
    tableHandlers: {
      setParams,
      setPage: useCallback((v: number) => setParams({ page: v }), [setParams]),
      setPageSize: useCallback(
        (v: number) => setParams({ pageSize: v }),
        [setParams],
      ),
      setSortBy: useCallback(
        (v: string) => setParams({ sortBy: v }),
        [setParams],
      ),
      setSortOrder: useCallback(
        (v: 'ASC' | 'DESC') => setParams({ sortOrder: v }),
        [setParams],
      ),
      setFilter: useCallback(
        (v: string) => {
          if (filter === v) return;
          setParams({
            filter: v,
            page: 1,
          });
        },
        [filter, setParams],
      ),
    },
  };
}
