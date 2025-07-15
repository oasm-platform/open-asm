import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useServerDataTable({
  defaultPage = 1,
  defaultPageSize = 10,
  defaultSortBy = "createdAt",
  defaultSortOrder = "DESC" as "ASC" | "DESC",
} = {}) {
  const [params, setParams] = useSearchParams();

  const getNumberParam = (key: string, fallback: number) => {
    const val = parseInt(params.get(key) || "");
    return isNaN(val) ? fallback : val;
  };

  const page = getNumberParam("page", defaultPage);
  const pageSize = getNumberParam("pageSize", defaultPageSize);
  const sortBy = params.get("sortBy") || defaultSortBy;
  const sortOrder =
    (params.get("sortOrder") as "ASC" | "DESC") || defaultSortOrder;
  const filter = params.get("filter") || "";

  const setParam = useCallback(
    (key: string, value: string | number | undefined) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value.toString());
      }
      setParams(params, { replace: true });
    },
    [params, setParams]
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
      setFilter: (v: string) => setParam("filter", v),
    },
  };
}
