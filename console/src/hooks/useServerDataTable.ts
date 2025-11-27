import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
  defaultSortBy = "createdAt",
  /**
   * Default sort order - either ASC (ascending) or DESC (descending) (default: "DESC")
   */
  defaultSortOrder = "DESC" as "ASC" | "DESC",
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
    filter: "",
  }));

  // Sync internal params with URL params when isUpdateSearchQueryParam is true
  useEffect(() => {
    if (isUpdateSearchQueryParam) {
      const getNumberParam = (key: string, fallback: number) => {
        const val = parseInt(urlParams.get(key) || "");
        return isNaN(val) ? fallback : val;
      };

      setInternalParams({
        page: getNumberParam("page", defaultPage),
        pageSize: getNumberParam("pageSize", defaultPageSize),
        sortBy: urlParams.get("sortBy") || defaultSortBy,
        sortOrder: (urlParams.get("sortOrder") as "ASC" | "DESC") || defaultSortOrder,
        filter: urlParams.get("filter") || "",
      });
    }
  }, [urlParams, defaultPage, defaultPageSize, defaultSortBy, defaultSortOrder, isUpdateSearchQueryParam]);

  const getNumberParam = (key: string, fallback: number) => {
    const val = parseInt(urlParams.get(key) || "");
    return isNaN(val) ? fallback : val;
  };

  // Use URL params when isUpdateSearchQueryParam is true, otherwise use internal params
  const page = isUpdateSearchQueryParam ? getNumberParam("page", defaultPage) : internalParams.page;
  const pageSize = isUpdateSearchQueryParam ? getNumberParam("pageSize", defaultPageSize) : internalParams.pageSize;
  const sortBy = isUpdateSearchQueryParam ? (urlParams.get("sortBy") || defaultSortBy) : internalParams.sortBy;
  const sortOrder = isUpdateSearchQueryParam
    ? (urlParams.get("sortOrder") as "ASC" | "DESC") || defaultSortOrder
    : internalParams.sortOrder;
  const filter = isUpdateSearchQueryParam ? (urlParams.get("filter") || "") : internalParams.filter;

  const setParam = useCallback(
    (key: string, value: string | number | undefined) => {
      if (isUpdateSearchQueryParam) {
        // Update URL params
        if (!value) {
          urlParams.delete(key);
        } else {
          urlParams.set(key, value.toString());
        }
        setUrlParams(urlParams, { replace: true });
      } else {
        // Update internal params only
        setInternalParams(prev => ({
          ...prev,
          [key]: value?.toString() || (key === 'page' ? defaultPage : key === 'pageSize' ? defaultPageSize : key === 'sortOrder' ? defaultSortOrder : "")
        }));
      }
    },
    [isUpdateSearchQueryParam, urlParams, setUrlParams, defaultPage, defaultPageSize, defaultSortOrder]
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
      setPage: (v: number) => setParam("page", v),
      setPageSize: (v: number) => setParam("pageSize", v),
      setSortBy: (v: string) => setParam("sortBy", v),
      setSortOrder: (v: "ASC" | "DESC") => setParam("sortOrder", v),
      setFilter: useCallback((v: string) => setParam("filter", v), [setParam]),
    },
  };
}
