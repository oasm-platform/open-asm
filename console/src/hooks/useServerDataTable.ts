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

  const setParam = useCallback(
    (key: string, value: string | number | undefined) => {
      if (isUpdateSearchQueryParam) {
        setUrlParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (!value) {
              next.delete(key);
            } else {
              next.set(key, value.toString());
            }
            return next;
          },
          { replace: true },
        );
      } else {
        setInternalParams((prev) => ({
          ...prev,
          [key]: value ?? '',
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
      setPage: useCallback((v: number) => setParam('page', v), [setParam]),
      setPageSize: useCallback(
        (v: number) => setParam('pageSize', v),
        [setParam],
      ),
      setSortBy: useCallback((v: string) => setParam('sortBy', v), [setParam]),
      setSortOrder: useCallback(
        (v: 'ASC' | 'DESC') => setParam('sortOrder', v),
        [setParam],
      ),
      setFilter: useCallback(
        (v: string) => {
          if (isUpdateSearchQueryParam) {
            setUrlParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (next.get('filter') === v) return prev;
                next.set('page', '1');
                next.set('filter', v);
                return next;
              },
              { replace: true },
            );
          } else {
            if (internalParams.filter === v) return;
            setParam('page', 1);
            setParam('filter', v);
          }
        },
        [isUpdateSearchQueryParam, setUrlParams, setParam, internalParams.filter],
      ),
    },
  };
}
