import { DataTable } from "@/components/ui/data-table";
import { useServerDataTable } from "@/hooks/useServerDataTable";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useAssetsControllerGetAssets } from "@/services/apis/gen/queries";
import { useState } from "react";
import AssetDetailSheet from "./asset-detail-sheet";
import { assetColumns } from "./data-column";

interface ListAssetsProps {
  targetId?: string;
  refetchInterval?: number;
}
export function ListAssets({ targetId, refetchInterval }: ListAssetsProps) {
  const { selectedWorkspace } = useWorkspaceSelector();
  const [isOpen, setIsOpen] = useState(false);
  const [currentRow, setCurrentRow] = useState(null);

  const {
    tableParams: { page, pageSize, sortBy, sortOrder, filter },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder, setFilter },
  } = useServerDataTable({
    defaultSortBy: "value",
    defaultSortOrder: "ASC",
  });

  const { data, isLoading } = useAssetsControllerGetAssets(
    {
      workspaceId: selectedWorkspace ?? "",
      targetIds: targetId ? [targetId] : undefined,
      value: filter,
      limit: pageSize,
      page,
      sortBy,
      sortOrder,
    },
    {
      query: {
        refetchInterval: refetchInterval ?? 5000,
        queryKey: ["assets", targetId],
      },
    },
  );

  const targets = data?.data ?? [];
  const total = data?.total ?? 0;

  if (!data && !isLoading) return <div>Error loading targets.</div>;

  return (
    <>
      <DataTable
        data={targets}
        columns={assetColumns}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        filterColumnKey="value"
        filterValue={filter}
        onFilterChange={setFilter}
        totalItems={total}
        onRowClick={(row) => {
          setCurrentRow(row);
          setIsOpen(!isOpen);
        }}
      />
      <AssetDetailSheet
        open={isOpen}
        setOpen={setIsOpen}
        currentRow={currentRow}
      />
    </>
  );
}
